/**
 * Settings. Spec §11 asks for a mute toggle; store policy asks for a restore
 * path for non-consumables, so both live here.
 *
 * An overlay sheet over `HomeScene`, like the shop, so the pet keeps breathing
 * behind it and nothing unloads.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { ANALYTICS, FEATURES } from '@/config/tuning';
import { GameContext } from '@/core/GameContext';
import { Ads } from '@/services/Ads';
import { Iap } from '@/services/Iap';
import { BUTTON_HEIGHT, Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { drawIcon } from '@/ui/icons';
import { FONT_BODY, RADIUS } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';
import { decodeSaveCode, encodeSaveCode, saveCodeMessage } from '@/core/saveCode';
import { copyToClipboard, openSaveDialog } from '@/ui/saveCodeDialog';
import { dayNumber } from '@/services/AnalyticsFunnel';
import { t } from '@/i18n';

const ROW_HEIGHT = 58;

export class SettingsScene extends Phaser.Scene {
  private context!: GameContext;
  private sheet!: Sheet;
  private body!: Phaser.GameObjects.Container;
  private toast!: Toast;
  private busy = false;
  private versionTaps = 0;
  private lastVersionTapAt = 0;

  constructor() {
    super(SCENE.settings);
  }

  create(): void {
    this.context = GameContext.from(this);
    this.busy = false;
    this.versionTaps = 0;
    this.lastVersionTapAt = 0;
    const { width, height } = this.scale.gameSize;

    this.sheet = new Sheet(this, width, height, {
      title: t('settings.title'),
      maxHeightRatio: 0.6,
      onClose: () => {
        this.scene.get(SCENE.home).events.emit('settings-closed');
        this.scene.stop();
      },
    });

    this.body = this.add.container(0, 0);
    this.sheet.content.add(this.body);

    this.toast = new Toast(this, width / 2, 128, width - 40);

    this.render();
    this.sheet.show();
  }

  private render(): void {
    this.body.removeAll(true);

    // The panel, not the canvas: on a wide screen they differ.
    const width = this.sheet.panelWidth;
    const pad = 20;
    let y = 0;

    /* ---- sound (§11) ---- */
    const muted = this.context.state.muted;
    y = this.addRow(
      pad,
      y,
      width,
      muted ? 'soundOff' : 'soundOn',
      t('settings.sound'),
      muted ? t('settings.off') : t('settings.on'),
      () => {
        // One switch drives both the persisted flag and the live bus.
        const next = !this.context.state.muted;
        this.context.state.setMuted(next);
        this.context.audio.setMuted(next);
        if (!next) this.context.audio.play('tap');
        this.render();
      },
    );

    /*
     * Music has its own switch rather than riding on the sound one. They are
     * genuinely different preferences: the cues are feedback, the loop is
     * atmosphere, and plenty of players want one without the other.
     */
    const musicMuted = this.context.state.musicMuted;
    y = this.addRow(
      pad,
      y,
      width,
      musicMuted ? 'musicOff' : 'music',
      t('settings.music'),
      musicMuted ? t('settings.off') : t('settings.on'),
      () => {
        const next = !this.context.state.musicMuted;
        this.context.state.setMusicMuted(next);
        // Unmuting starts playback: this tap is itself the required gesture.
        this.context.music.setMuted(next);
        this.render();
      },
    );

    y = this.addRow(
      pad,
      y,
      width,
      'star',
      t('settings.names'),
      `${this.context.state.playerName} · ${this.context.state.petName}`,
      () => {
        this.context.audio.play('tap');
        // The home scene owns the dialog and the redraw that follows it, so the
        // sheet closes and hands over rather than editing state from underneath.
        this.scene.get(SCENE.home).events.emit('edit-names');
        this.sheet.close();
      },
    );

    /*
     * The tutorial only runs itself on a genuinely fresh save — a player who
     * already has a pet must not be dropped back into onboarding by an update.
     * That leaves no way to see it again, hence this.
     */
    y = this.addRow(pad, y, width, 'star', t('settings.replayTutorial'), '', () => {
      this.context.state.setTutorialStep(0);
      this.context.audio.play('tap');
      this.toast.show(t('settings.toast.tutorialQueued'));
      this.sheet.close();
    });

    /*
     * Backup and restore.
     *
     * Saves are local, and on the web that means browser storage — one "clear
     * browsing data" and a pet somebody has kept alive for a month is gone,
     * with no account to restore it from. These two rows are the whole
     * mitigation, so they sit above the purchase rows rather than at the
     * bottom where nobody scrolls.
     */
    y = this.addRow(pad, y, width, 'restore', t('settings.backup'), t('settings.backup.value'), () => {
      this.context.audio.play('tap');
      void this.showBackupCode();
    });

    y = this.addRow(pad, y, width, 'restore', t('settings.restoreCode'), '', () => {
      this.context.audio.play('tap');
      this.showRestoreDialog();
    });

    /* ---- restore purchases ---- */
    y = this.addRow(pad, y, width, 'restore', t('settings.restorePurchases'), '', () => {
      void this.restore();
    });

    /*
     * Remove ads (§13 / §17.4). Offered only when the flag is on AND there is
     * actually a forced ad format to remove. v1 is rewarded-video only, so the
     * second condition is false and this row stays hidden — selling an
     * entitlement that changes nothing is a store-listing problem, not a
     * revenue one. An owned entitlement is still acknowledged either way, so a
     * player who bought it in a later build never sees it vanish.
     */
    const owned = this.context.iap.hasRemovedAds;
    if (FEATURES.removeAdsIap && (Ads.hasAnythingToRemove || owned)) {
      y = this.addRow(pad, y, width, 'tv', t('settings.removeAds'), owned ? t('settings.removeAds.owned') : t('settings.removeAds.buy'), () => {
        if (owned) return;
        void this.buyRemoveAds();
      });
    }

    y += 10;
    /*
     * The version label is also the way in to the diagnostics sheet: seven taps
     * inside three seconds. Hidden rather than absent because the funnel is
     * only worth collecting if somebody can read it off a real handset, and
     * hidden rather than a visible row because it is developer plumbing that
     * would only confuse a player.
     */
    const version = this.add
      .text(width / 2, y, t('settings.version', { version: __APP_VERSION__ }), {
        fontFamily: FONT_BODY,
        fontSize: '11px',
        color: '#a995c4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: false });
    version.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onVersionTapped());
    this.body.add(version);
    y += 28;

    this.body.add(
      new Button(this, pad, y, t('common.close'), {
        width: width - pad * 2,
        tone: 'coral',
        onPress: () => this.sheet.close(),
      }),
    );

    this.sheet.fitToContent(y + BUTTON_HEIGHT);
  }

  /**
   * Flush first. The code has to describe what is on disk, not what was on
   * disk half a second ago — the save is debounced, so a player who backs up
   * immediately after buying a hat would otherwise get a code without it.
   */
  private async showBackupCode(): Promise<void> {
    await this.context.save.flush();
    const code = encodeSaveCode(this.context.state.snapshot);

    openSaveDialog({
      title: t('settings.backup'),
      body: t('save.backup.body'),
      value: code,
      readOnly: true,
      confirmLabel: t('save.backup.confirm'),
      onConfirm: () => {
        // Fire and forget would be wrong here: a player told "copied" over a
        // clipboard that refused the write is a player who loses their pet
        // believing they had backed it up.
        void copyToClipboard(code).then((copied) => {
          const note = document.querySelector(`#biskit-save-dialog .note`);
          if (!note) return;
          note.textContent = copied
            ? t('save.backup.copied')
            : t('save.backup.copyFailed');
          note.classList.toggle('ok', copied);
        });
        // Stay open either way: the code is still on screen to copy manually.
        return '';
      },
    });
  }

  private showRestoreDialog(): void {
    openSaveDialog({
      title: t('settings.restoreCode'),
      body: t('save.restore.body'),
      readOnly: false,
      confirmLabel: t('save.restore.confirm'),
      onConfirm: (value) => {
        const result = decodeSaveCode(value, this.context.clock.now());
        if (!result.ok) return saveCodeMessage(result.reason);

        // Atomic by construction: `decodeSaveCode` either produced a complete,
        // validated SaveData or it produced a reason. Nothing is written until
        // we are past that branch.
        this.context.state.hydrate(result.data);
        void this.context.save.flush();
        this.context.audio.play('coin');

        // A full reboot rather than a re-render. Half the game reads its
        // starting values once at scene create — the rig, the room, the meters,
        // the task set — and hot-swapping the state underneath all of it is a
        // much larger surface for a bug than starting again.
        this.scene.stop();
        this.game.scene.getScenes(true).forEach((scene) => scene.scene.stop());
        this.scene.start(SCENE.boot);
        return null;
      },
    });
  }

  private onVersionTapped(): void {
    const now = this.context.clock.now();
    // The window resets the count, so seven ordinary taps spread over a minute
    // of fiddling do not open a developer sheet on a player's phone.
    this.versionTaps = now - this.lastVersionTapAt > ANALYTICS.debugTapWindowMs ? 1 : this.versionTaps + 1;
    this.lastVersionTapAt = now;
    if (this.versionTaps < ANALYTICS.debugTapCount) return;

    this.versionTaps = 0;
    this.showDiagnostics();
  }

  private showDiagnostics(): void {
    const funnel = this.context.funnel;
    const log = this.context.log;
    if (!funnel) return;

    const data = funnel.snapshot;
    const day = dayNumber(data.installedAt, this.context.clock.now());
    const counts = Object.entries(data.counts).sort((a, b) => b[1] - a[1]);

    const report = [
      t('settings.version', { version: __APP_VERSION__ }),
      `day ${day} since install · returned on days [${data.activeDays.join(', ')}]`,
      `max level ${data.maxLevel}`,
      '',
      '— counts —',
      ...counts.map(([event, n]) => `${String(n).padStart(5)}  ${event}`),
      '',
      '— last events —',
      ...(log?.recent ?? [])
        .slice(-25)
        .map((e) => `${new Date(e.at).toISOString().slice(11, 19)}  ${e.event} ${JSON.stringify(e.props)}`),
    ].join('\n');

    openSaveDialog({
      title: t('settings.diagnostics.title'),
      body: t('settings.diagnostics.body'),
      value: report,
      readOnly: true,
      confirmLabel: t('settings.diagnostics.confirm'),
      onConfirm: () => {
        void copyToClipboard(report);
        return t('settings.diagnostics.copied');
      },
    });
  }

  /** One tappable settings row. Returns the y for the next one. */
  private addRow(
    pad: number,
    y: number,
    width: number,
    icon: Parameters<typeof drawIcon>[1],
    label: string,
    value: string,
    onPress: () => void,
  ): number {
    const row = this.add.container(pad, y);
    const rowWidth = width - pad * 2;

    const card = this.add.graphics();
    card.fillStyle(PALETTE.white, 1);
    card.lineStyle(3, PALETTE.ink, 1);
    card.fillRoundedRect(0, 0, rowWidth, ROW_HEIGHT, RADIUS.card);
    card.strokeRoundedRect(0, 0, rowWidth, ROW_HEIGHT, RADIUS.card);
    row.add(card);

    const glyph = drawIcon(this, icon, 24, PALETTE.ink2, 2.2);
    glyph.setPosition(34, ROW_HEIGHT / 2);
    row.add(glyph);

    row.add(
      this.add
        .text(62, ROW_HEIGHT / 2, label, {
          fontFamily: FONT_BODY,
          fontSize: '14px',
          color: '#33243f',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    if (value) {
      row.add(
        this.add
          .text(rowWidth - 18, ROW_HEIGHT / 2, value, {
            fontFamily: FONT_BODY,
            fontSize: '13px',
            color: '#8367bc',
            fontStyle: 'bold',
          })
          .setOrigin(1, 0.5),
      );
    }

    const hit = this.add
      .rectangle(rowWidth / 2, ROW_HEIGHT / 2, rowWidth, ROW_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onPress);
    row.add(hit);

    this.body.add(row);
    return y + ROW_HEIGHT + 10;
  }

  private async restore(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const skus = await this.context.iap.restore();
      this.toast.show(
        skus.length > 0 ? 'Purchases restored.' : t('settings.toast.nothingToRestore'),
      );
      this.render();
    } finally {
      this.busy = false;
    }
  }

  private async buyRemoveAds(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.context.iap.buyRemoveAds();
      const message = Iap.message(result);
      if (message) this.toast.show(message);
      this.render();
    } finally {
      this.busy = false;
    }
  }
}

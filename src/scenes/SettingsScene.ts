/**
 * Settings. Spec §11 asks for a mute toggle; store policy asks for a restore
 * path for non-consumables, so both live here.
 *
 * An overlay sheet over `HomeScene`, like the shop, so the pet keeps breathing
 * behind it and nothing unloads.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { FEATURES } from '@/config/tuning';
import { GameContext } from '@/core/GameContext';
import { Ads } from '@/services/Ads';
import { Iap } from '@/services/Iap';
import { BUTTON_HEIGHT, Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { drawIcon } from '@/ui/icons';
import { FONT_BODY, RADIUS } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';

const ROW_HEIGHT = 58;

export class SettingsScene extends Phaser.Scene {
  private context!: GameContext;
  private sheet!: Sheet;
  private body!: Phaser.GameObjects.Container;
  private toast!: Toast;
  private busy = false;

  constructor() {
    super(SCENE.settings);
  }

  create(): void {
    this.context = GameContext.from(this);
    this.busy = false;
    const { width, height } = this.scale.gameSize;

    this.sheet = new Sheet(this, width, height, {
      title: 'Settings',
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

    const width = this.scale.gameSize.width;
    const pad = 20;
    let y = 0;

    /* ---- sound (§11) ---- */
    const muted = this.context.state.muted;
    y = this.addRow(
      pad,
      y,
      width,
      muted ? 'soundOff' : 'soundOn',
      'Sound',
      muted ? 'Off' : 'On',
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
      'Music',
      musicMuted ? 'Off' : 'On',
      () => {
        const next = !this.context.state.musicMuted;
        this.context.state.setMusicMuted(next);
        // Unmuting starts playback: this tap is itself the required gesture.
        this.context.music.setMuted(next);
        this.render();
      },
    );

    /* ---- restore purchases ---- */
    y = this.addRow(pad, y, width, 'restore', 'Restore purchases', '', () => {
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
      y = this.addRow(pad, y, width, 'tv', 'Remove ads', owned ? 'Owned' : 'Buy', () => {
        if (owned) return;
        void this.buyRemoveAds();
      });
    }

    y += 10;
    this.body.add(
      this.add
        .text(width / 2, y, `Biskit v${__APP_VERSION__}`, {
          fontFamily: FONT_BODY,
          fontSize: '11px',
          color: '#a995c4',
          fontStyle: 'bold',
        })
        .setOrigin(0.5, 0),
    );
    y += 28;

    this.body.add(
      new Button(this, pad, y, 'Close', {
        width: width - pad * 2,
        tone: 'coral',
        onPress: () => this.sheet.close(),
      }),
    );

    this.sheet.fitToContent(y + BUTTON_HEIGHT);
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
        skus.length > 0 ? 'Purchases restored.' : 'Nothing to restore on this account.',
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

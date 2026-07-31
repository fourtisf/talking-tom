/**
 * The daily task list.
 *
 * An overlay sheet over `HomeScene`, like the shop and settings, so the pet
 * keeps breathing behind it. Every row states one concrete thing to do, how far
 * along it is, and what it pays — the whole point is that a new player never has
 * to guess what the game wants from them.
 *
 * Rows are tappable when unfinished: tapping sends the player to the room where
 * the task is actually done, because "Give Biskit 2 baths" is useless if they
 * cannot find the bath.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { GameContext } from '@/core/GameContext';
import type { TaskView } from '@/core/Tasks';
import type { AwardView } from '@/core/Awards';
import type { TaskTrigger } from '@/config/tuning';
import { BUTTON_HEIGHT, Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { drawIcon, type IconName } from '@/ui/icons';
import { FONT_BODY, FONT_DISPLAY, RADIUS } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';
import { t } from '@/i18n';
import { taskLabel } from '@/i18n/content';

const ROW_HEIGHT = 84;
const ROW_GAP = 10;

/**
 * How many milestones the sheet will show at once.
 *
 * There are sixteen and this Sheet does not scroll — the wardrobe hit the same
 * wall and its Close button fell off the bottom, which is a sheet you cannot
 * dismiss. At a 0.86 height ratio the budget is about five rows once the
 * title, the tabs, the footer and the button have taken theirs.
 *
 * Five is enough because the list is SORTED: claimable first, then whatever is
 * closest to done. The five that fit are the five worth showing. What does not
 * fit is counted in the footer rather than silently dropped — a list that
 * quietly stops at five reads as "that is all there is".
 */
const AWARDS_VISIBLE = 5;

/** Which room button a task points at, and the icon that labels it. */
const ROOM_ICON: Readonly<Record<TaskView['def']['room'], IconName>> = {
  home: 'home',
  kitchen: 'food',
  bath: 'bath',
  bed: 'moon',
  loo: 'loo',
  play: 'game',
  // Two doors to the same sheet, so two entries. `shop` is the hat button on
  // the rail and opens on hats; `style` is the bottom-bar tab and opens on
  // clothes. No task points at `style` today — the map is exhaustive over
  // `RoomKey`, which is how the compiler found this the moment the tab landed.
  style: 'shirt',
  shop: 'hat',
};

/** What each milestone is about, at a glance. Awards have no room to point at. */
const AWARD_ICON: Readonly<Record<TaskTrigger, IconName>> = {
  feed: 'food',
  scrub: 'bath',
  pet: 'hand',
  voiceMimic: 'mic',
  buyItem: 'hat',
  miniGameCatch: 'game',
  miniGameCopycat: 'music',
  sleep: 'moon',
  litter: 'loo',
  tidy: 'soap',
  photo: 'camera',
  allStatsHigh: 'star',
};

export class TasksScene extends Phaser.Scene {
  private context!: GameContext;
  private sheet!: Sheet;
  private body!: Phaser.GameObjects.Container;
  private toast!: Toast;
  /**
   * Which list is showing.
   *
   * Reset in `create`, not here: Phaser reuses the scene instance, so a field
   * initialiser runs once per game lifetime and the sheet would reopen on
   * whichever tab it was left on three sessions ago. Same trap `ShopScene`
   * documents, same fix.
   */
  private tab: 'tasks' | 'awards' = 'tasks';

  constructor() {
    super(SCENE.tasks);
  }

  create(): void {
    this.context = GameContext.from(this);
    const { width, height } = this.scale.gameSize;

    this.sheet = new Sheet(this, width, height, {
      title: t('tasks.title'),
      subtitle: t('tasks.subtitle'),
      // 0.86, up from 0.76. The awards tab is the tallest thing this sheet
      // shows and the extra tenth is a whole row of it.
      maxHeightRatio: 0.86,
      onClose: () => {
        this.scene.get(SCENE.home).events.emit('tasks-closed');
        this.scene.stop();
      },
    });

    this.tab = 'tasks';
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
    let hidden = 0;
    // Two lists under a heading that names only the first of them reads as a
    // sheet that failed to switch.
    this.sheet.setHeading(
      this.tab === 'awards' ? t('awards.title') : t('tasks.title'),
      this.tab === 'awards' ? t('awards.subtitle') : t('tasks.subtitle'),
    );
    let y = this.addTabs(pad, 0, width);

    if (this.tab === 'tasks') {
      for (const view of this.context.tasks.list) {
        this.addRow(pad, y, width, view);
        y += ROW_HEIGHT + ROW_GAP;
      }
    } else {
      /*
       * Sorted, not in definition order. Sixteen rows do not fit on a phone,
       * so the order IS the interface — a flat list buries the one row with a
       * button under nine the player already collected. See `Awards.sorted`.
       */
      const all = this.context.awards.sorted;
      for (const view of all.slice(0, AWARDS_VISIBLE)) {
        this.addAwardRow(pad, y, width, view);
        y += ROW_HEIGHT + ROW_GAP;
      }
      hidden = Math.max(0, all.length - AWARDS_VISIBLE);
    }

    y += 6;
    this.body.add(
      this.add
        .text(
          width / 2,
          y,
          this.tab === 'awards'
            ? hidden > 0
              ? t('awards.footer.more', { n: hidden })
              : t('awards.footer')
            : this.context.tasks.allDone
              ? t('tasks.footer.allDone')
              : t('tasks.footer.daily'),
          {
            fontFamily: FONT_BODY,
            fontSize: '12px',
            color: '#a995c4',
            fontStyle: 'bold',
          },
        )
        .setOrigin(0.5, 0),
    );
    y += 30;

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
   * The two-tab header. Returns the y the first row starts at.
   *
   * A tab rather than a second button on the rail, and a second button was the
   * first idea. The rail already carries four; a fifth for a list the player
   * opens once a week is the wrong trade. This sheet is already the answer to
   * "what should I be doing" — the daily version and the forever version of
   * that question belong in the same place.
   */
  private addTabs(pad: number, y: number, width: number): number {
    const inner = width - pad * 2;
    const gap = 8;
    const tabW = (inner - gap) / 2;
    const height = 36;
    const claimable = this.context.awards.claimableCount;

    const tabs: Array<{ key: 'tasks' | 'awards'; label: string; badge: number }> = [
      { key: 'tasks', label: t('tasks.tab.today'), badge: this.context.tasks.claimableCount },
      { key: 'awards', label: t('tasks.tab.awards'), badge: claimable },
    ];

    tabs.forEach((tab, i) => {
      const left = pad + i * (tabW + gap);
      const on = this.tab === tab.key;
      const face = this.add.graphics();
      face.fillStyle(on ? PALETTE.grape : PALETTE.white, 1);
      face.lineStyle(3, PALETTE.ink, 1);
      face.fillRoundedRect(left, y, tabW, height, height / 2);
      face.strokeRoundedRect(left, y, tabW, height, height / 2);
      this.body.add(face);

      this.body.add(
        this.add
          .text(left + tabW / 2, y + height / 2, tab.label, {
            fontFamily: FONT_DISPLAY,
            fontSize: '13px',
            color: on ? '#ffffff' : '#6b54a0',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );

      /*
       * The dot goes on the INACTIVE tab only. On the tab you are looking at
       * it is noise — the claim chips are right there, pulsing.
       */
      if (tab.badge > 0 && !on) {
        const dot = this.add.graphics();
        dot.fillStyle(0xff5b7f, 1);
        dot.fillCircle(left + tabW - 16, y + 12, 6);
        dot.lineStyle(2.5, PALETTE.white, 1);
        dot.strokeCircle(left + tabW - 16, y + 12, 6);
        this.body.add(dot);
      }

      const hit = this.add
        .rectangle(left + tabW / 2, y + height / 2, tabW, height, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (this.tab === tab.key) return;
        this.tab = tab.key;
        this.context.audio.play('tap');
        this.render();
      });
      this.body.add(hit);
    });

    return y + height + 14;
  }

  /**
   * A milestone row. Same shape as a task row, three differences that matter.
   *
   * It pays GEMS, so the reward reads in gems and the claim chip is butter
   * rather than mint — the two currencies are never the same colour anywhere
   * else in the game and this is not the place to start. It has no room to
   * send you to, because "feed her 250 times" is not somewhere you go. And an
   * unfinished row is not tappable at all: a task row that does nothing on tap
   * would be a dead control, but here the row IS the information.
   */
  private addAwardRow(pad: number, y: number, width: number, view: AwardView): void {
    const row = this.add.container(pad, y);
    const rowWidth = width - pad * 2;
    const { def, count, done, claimed } = view;

    const card = this.add.graphics();
    card.fillStyle(claimed ? PALETTE.cream : PALETTE.white, 1);
    card.lineStyle(3, done && !claimed ? PALETTE.butterLo : PALETTE.ink, 1);
    card.fillRoundedRect(0, 0, rowWidth, ROW_HEIGHT, RADIUS.card);
    card.strokeRoundedRect(0, 0, rowWidth, ROW_HEIGHT, RADIUS.card);
    row.add(card);

    const glyph = drawIcon(this, AWARD_ICON[def.trigger], 22, claimed ? 0xb6a6cd : PALETTE.ink2, 2.2);
    glyph.setPosition(32, 34);
    row.add(glyph);

    row.add(
      this.add
        .text(58, 22, def.label, {
          fontFamily: FONT_BODY,
          fontSize: '13.5px',
          color: claimed ? '#9c8bb5' : '#33243f',
          fontStyle: 'bold',
          wordWrap: { width: rowWidth - 74 },
        })
        .setOrigin(0, 0.5),
    );

    const barX = 58;
    const barW = rowWidth - barX - 16;
    const barY = 42;
    const fraction = def.target <= 0 ? 1 : Math.min(1, count / def.target);
    const bar = this.add.graphics();
    bar.fillStyle(0xe4dcee, 1);
    bar.fillRoundedRect(barX, barY, barW, 10, 5);
    if (fraction > 0) {
      bar.fillStyle(done ? PALETTE.butter : PALETTE.grape, 1);
      bar.fillRoundedRect(barX, barY, Math.max(10, barW * fraction), 10, 5);
    }
    row.add(bar);

    const footY = barY + 22;
    row.add(
      this.add
        .text(barX, footY, `${count} / ${def.target}`, {
          fontFamily: FONT_BODY,
          fontSize: '11px',
          color: '#9d8bb8',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );
    row.add(
      this.add
        .text(barX + 56, footY, t('awards.reward', { n: def.gems }), {
          fontFamily: FONT_BODY,
          fontSize: '11.5px',
          color: claimed ? '#b0a0c6' : '#3f8fb8',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    if (done && !claimed) {
      const claim = this.add.container(rowWidth - 60, footY);
      const chip = this.add.graphics();
      chip.fillStyle(PALETTE.butter, 1);
      chip.lineStyle(2.5, PALETTE.ink, 1);
      chip.fillRoundedRect(-42, -14, 84, 28, 14);
      chip.strokeRoundedRect(-42, -14, 84, 28, 14);
      claim.add(chip);
      claim.add(
        this.add
          .text(0, 0, t('tasks.claim'), {
            fontFamily: FONT_DISPLAY,
            fontSize: '12.5px',
            color: '#6b4a0e',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      row.add(claim);
      this.tweens.add({
        targets: claim,
        scale: { from: 1, to: 1.06 },
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      const hit = this.add
        .rectangle(rowWidth / 2, ROW_HEIGHT / 2, rowWidth, ROW_HEIGHT, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.context.awards.claim(def.id)) return;
        this.context.audio.play('coin');
        this.toast.show(t('awards.claimed', { n: def.gems }));
        this.render();
      });
      row.add(hit);
    } else if (claimed) {
      row.add(
        this.add
          .text(rowWidth - 16, footY, t('tasks.collected'), {
            fontFamily: FONT_BODY,
            fontSize: '12.5px',
            color: '#7fc4a4',
            fontStyle: 'bold',
          })
          .setOrigin(1, 0.5),
      );
    }

    this.body.add(row);
  }

  private addRow(pad: number, y: number, width: number, view: TaskView): void {
    const row = this.add.container(pad, y);
    const rowWidth = width - pad * 2;
    const { def, count, done, claimed } = view;

    const card = this.add.graphics();
    // A claimed row is dimmed rather than removed: seeing the finished ones is
    // most of the reward, and a list that shrinks as you play feels like loss.
    card.fillStyle(claimed ? PALETTE.cream : PALETTE.white, 1);
    card.lineStyle(3, done && !claimed ? PALETTE.mintLo : PALETTE.ink, 1);
    card.fillRoundedRect(0, 0, rowWidth, ROW_HEIGHT, RADIUS.card);
    card.strokeRoundedRect(0, 0, rowWidth, ROW_HEIGHT, RADIUS.card);
    row.add(card);

    const glyph = drawIcon(this, ROOM_ICON[def.room], 22, claimed ? 0xb6a6cd : PALETTE.ink2, 2.2);
    glyph.setPosition(32, 34);
    row.add(glyph);

    row.add(
      this.add
        .text(58, 22, taskLabel(def.id, def.target, def.label), {
          fontFamily: FONT_BODY,
          fontSize: '13.5px',
          color: claimed ? '#9c8bb5' : '#33243f',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    /* ---- progress ---- */
    const barX = 58;
    const barW = rowWidth - barX - 16;
    const barY = 42;
    const fraction = def.target <= 0 ? 1 : Math.min(1, count / def.target);

    const bar = this.add.graphics();
    bar.fillStyle(0xe4dcee, 1);
    bar.fillRoundedRect(barX, barY, barW, 10, 5);
    if (fraction > 0) {
      bar.fillStyle(done ? PALETTE.mint : PALETTE.grape, 1);
      // Never narrower than its own cap, or a sliver of progress renders as a dot.
      bar.fillRoundedRect(barX, barY, Math.max(10, barW * fraction), 10, 5);
    }
    row.add(bar);

    /*
     * Bottom line: count, then the reward, then the action.
     *
     * The reward sits here rather than up beside the label because the label is
     * the longest thing in the row and a right-aligned reward on the same line
     * collides with it — "Buy something from the shop" ran straight through its
     * own "+50". Down here the label has the full width and cannot.
     */
    const footY = barY + 22;

    row.add(
      this.add
        .text(barX, footY, `${count} / ${def.target}`, {
          fontFamily: FONT_BODY,
          fontSize: '11px',
          color: '#9d8bb8',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    row.add(
      this.add
        .text(barX + 46, footY, `+${def.coins}  ·  ${def.xp} XP`, {
          fontFamily: FONT_BODY,
          fontSize: '11.5px',
          color: claimed ? '#b0a0c6' : '#8367bc',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5),
    );

    /* ---- claim, or a nudge to the right room ---- */
    if (done && !claimed) {
      const claim = this.add.container(rowWidth - 60, footY);
      const chip = this.add.graphics();
      chip.fillStyle(PALETTE.mint, 1);
      chip.lineStyle(2.5, PALETTE.ink, 1);
      chip.fillRoundedRect(-42, -14, 84, 28, 14);
      chip.strokeRoundedRect(-42, -14, 84, 28, 14);
      claim.add(chip);
      claim.add(
        this.add
          .text(0, 0, t('tasks.claim'), {
            fontFamily: FONT_DISPLAY,
            fontSize: '12.5px',
            color: '#14331f',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      row.add(claim);

      // Pulses so the eye finds it without reading the row.
      this.tweens.add({
        targets: claim,
        scale: { from: 1, to: 1.06 },
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      row.add(
        this.add
          .text(rowWidth - 16, footY, claimed ? t('tasks.collected') : t('tasks.go'), {
            fontFamily: FONT_BODY,
            fontSize: '12.5px',
            color: claimed ? '#7fc4a4' : '#8367bc',
            fontStyle: 'bold',
          })
          .setOrigin(1, 0.5),
      );
    }

    const hit = this.add
      .rectangle(rowWidth / 2, ROW_HEIGHT / 2, rowWidth, ROW_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: !claimed });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onRowPressed(view));
    row.add(hit);

    this.body.add(row);
  }

  private onRowPressed(view: TaskView): void {
    if (view.claimed) return;

    if (view.done) {
      if (this.context.tasks.claim(view.def.id)) {
        this.context.audio.play('coin');
        this.toast.show(`+${view.def.coins} coins  ·  +${view.def.xp} XP`);
        this.render();
      }
      return;
    }

    // Unfinished: close and send them where the task is actually done. Naming
    // the room is not enough — a new player does not know the bath is a tab.
    this.context.audio.play('tap');
    this.scene.get(SCENE.home).events.emit('tasks-goto', view.def.room);
    this.sheet.close();
  }
}

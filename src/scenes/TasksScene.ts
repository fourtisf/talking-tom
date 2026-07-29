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
import { BUTTON_HEIGHT, Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { drawIcon, type IconName } from '@/ui/icons';
import { FONT_BODY, FONT_DISPLAY, RADIUS } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';

const ROW_HEIGHT = 84;
const ROW_GAP = 10;

/** Which room button a task points at, and the icon that labels it. */
const ROOM_ICON: Readonly<Record<TaskView['def']['room'], IconName>> = {
  home: 'home',
  kitchen: 'food',
  bath: 'bath',
  bed: 'moon',
  play: 'game',
  shop: 'hat',
};

export class TasksScene extends Phaser.Scene {
  private context!: GameContext;
  private sheet!: Sheet;
  private body!: Phaser.GameObjects.Container;
  private toast!: Toast;

  constructor() {
    super(SCENE.tasks);
  }

  create(): void {
    this.context = GameContext.from(this);
    const { width, height } = this.scale.gameSize;

    this.sheet = new Sheet(this, width, height, {
      title: 'Today’s tasks',
      subtitle: 'Finish these to earn coins and level up',
      maxHeightRatio: 0.76,
      onClose: () => {
        this.scene.get(SCENE.home).events.emit('tasks-closed');
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

    for (const view of this.context.tasks.list) {
      this.addRow(pad, y, width, view);
      y += ROW_HEIGHT + ROW_GAP;
    }

    y += 6;
    this.body.add(
      this.add
        .text(
          width / 2,
          y,
          this.context.tasks.allDone
            ? 'All done — new tasks tomorrow!'
            : 'New tasks every day',
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
      new Button(this, pad, y, 'Close', {
        width: width - pad * 2,
        tone: 'coral',
        onPress: () => this.sheet.close(),
      }),
    );

    this.sheet.fitToContent(y + BUTTON_HEIGHT);
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
        .text(58, 22, def.label, {
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
          .text(0, 0, 'CLAIM', {
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
          .text(rowWidth - 16, footY, claimed ? 'Collected' : 'Go →', {
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

/**
 * Transient one-line message. One toast at a time: a new message replaces the
 * old rather than stacking, because a queue of pet complaints reads as noise.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { DEPTH, FONT_BODY } from '@/ui/theme';

const VISIBLE_MS = 1700;

export class Toast extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private hideTimer: Phaser.Time.TimerEvent | null = null;
  private readonly maxWidth: number;

  constructor(scene: Phaser.Scene, x: number, y: number, maxWidth: number) {
    super(scene, x, y);
    this.maxWidth = maxWidth;
    this.setDepth(DEPTH.toast).setAlpha(0).setScrollFactor(0);

    this.background = scene.add.graphics();
    this.add(this.background);

    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_BODY,
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: maxWidth - 40 },
      })
      .setOrigin(0.5);
    this.add(this.label);

    scene.add.existing(this);
  }

  show(message: string): void {
    this.label.setText(message);

    const width = Math.min(this.maxWidth, this.label.width + 38);
    const height = this.label.height + 22;
    this.background.clear();
    this.background.fillStyle(PALETTE.ink, 1);
    this.background.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    this.background.lineStyle(3, PALETTE.white, 0.2);
    this.background.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

    this.scene.tweens.killTweensOf(this);
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 200,
      ease: 'Sine.easeOut',
    });

    this.hideTimer?.remove();
    this.hideTimer = this.scene.time.delayedCall(VISIBLE_MS, () => this.hide());
  }

  hide(): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 260,
      ease: 'Sine.easeIn',
    });
  }

  override destroy(fromScene?: boolean): void {
    this.hideTimer?.remove();
    super.destroy(fromScene);
  }
}

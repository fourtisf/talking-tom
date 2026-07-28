/**
 * One stat meter: icon chip, track, and a fill that eases to its new value.
 * Pulses while the stat sits under its warn threshold (§5).
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { STAT_MAX } from '@/config/tuning';
import { bakeArt } from '@/ui/bake';
import { drawIcon, type IconName } from '@/ui/icons';
import { RADIUS } from '@/ui/theme';

export interface MeterBarConfig {
  width: number;
  icon: IconName;
  accent: number;
}

export class MeterBar extends Phaser.GameObjects.Container {
  private readonly cardWidth: number;
  private readonly accent: number;
  private readonly card: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly barWidth: number;
  private pulse: Phaser.Tweens.Tween | null = null;
  private slide: Phaser.Tweens.Tween | null = null;
  private value: number = STAT_MAX;
  private displayed: number = STAT_MAX;

  constructor(scene: Phaser.Scene, x: number, y: number, config: MeterBarConfig) {
    super(scene, x, y);
    this.cardWidth = config.width;
    this.accent = config.accent;
    this.barWidth = config.width - 16;

    const height = 62;

    // Card, chip and track never change, so they bake into one quad. Only the
    // fill below is redrawn, and only when the stat actually moves.
    this.card = bakeArt(
      scene,
      `meter:${config.width.toFixed(1)}:${config.accent}`,
      { left: -2, top: -2, right: config.width + 2, bottom: height + 2 },
      (g) => {
        g.fillStyle(PALETTE.white, 0.94);
        g.lineStyle(2.5, PALETTE.line, 1);
        g.fillRoundedRect(0, 0, config.width, height, RADIUS.card);
        g.strokeRoundedRect(0, 0, config.width, height, RADIUS.card);
        g.fillStyle(config.accent, 1);
        g.fillCircle(config.width / 2, 20, 13);
        g.fillStyle(0xe4dcee, 1);
        g.fillRoundedRect(8, 40, this.barWidth, 13, 6.5);
      },
    );
    this.add(this.card);

    const icon = drawIcon(scene, config.icon, 15, PALETTE.white, 2.4);
    icon.setPosition(config.width / 2, 20);
    this.add(icon);

    this.fill = scene.add.graphics();
    this.add(this.fill);
    this.redrawFill(STAT_MAX);

    scene.add.existing(this);
  }

  /** Animate to `value` (0..100). Repeated calls retarget the same tween. */
  setValue(value: number, warnBelow: number): void {
    this.value = Phaser.Math.Clamp(value, 0, STAT_MAX);

    // Stop only the previous fill tween. Killing every tween on `this` would
    // also kill the low-stat pulse, which would then never come back.
    this.slide?.stop();
    this.slide = this.scene.tweens.addCounter({
      from: this.displayed,
      to: this.value,
      duration: 550,
      ease: 'Back.easeOut',
      onUpdate: (tween) => {
        this.displayed = tween.getValue() ?? this.value;
        this.redrawFill(this.displayed);
      },
    });

    this.setLow(this.value < warnBelow);
  }

  private redrawFill(value: number): void {
    const width = Math.max(0, (this.barWidth * Phaser.Math.Clamp(value, 0, STAT_MAX)) / STAT_MAX);
    this.fill.clear();
    if (width < 1) return;
    this.fill.fillStyle(this.accent, 1);
    this.fill.fillRoundedRect(8, 40, width, 13, Math.min(6.5, width / 2));
  }

  private setLow(low: boolean): void {
    if (low && !this.pulse) {
      this.pulse = this.scene.tweens.add({
        targets: this,
        scale: 1.045,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!low && this.pulse) {
      this.pulse.stop();
      this.pulse = null;
      this.setScale(1);
    }
  }

  get cardSize(): number {
    return this.cardWidth;
  }

  override destroy(fromScene?: boolean): void {
    this.pulse?.stop();
    this.slide?.stop();
    super.destroy(fromScene);
  }
}

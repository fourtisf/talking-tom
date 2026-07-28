/**
 * Asset loading and the boot splash.
 *
 * There are no image or audio assets in this build — the pet is vector
 * placeholder art (§2.1) and every sound is synthesised (§11) — so this scene
 * exists to hold the loading bar for whatever the illustrator delivers, and to
 * give the first frame something to show. It advances as soon as the queue is
 * empty, which today is immediately.
 */

import Phaser from 'phaser';

import { BACKDROP, PALETTE } from '@/config/palette';
import { FONT_DISPLAY } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';

export class PreloadScene extends Phaser.Scene {
  private bar: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super(SCENE.preload);
  }

  preload(): void {
    this.cameras.main.setBackgroundColor(BACKDROP);
    const { width, height } = this.scale.gameSize;

    this.add
      .text(width / 2, height / 2 - 40, 'Biskit', {
        fontFamily: FONT_DISPLAY,
        fontSize: '44px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const barWidth = Math.min(220, width - 80);
    const track = this.add.graphics();
    track.fillStyle(PALETTE.white, 0.18);
    track.fillRoundedRect(width / 2 - barWidth / 2, height / 2 + 20, barWidth, 10, 5);

    this.bar = this.add.graphics();
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      this.bar?.clear();
      this.bar?.fillStyle(PALETTE.mint, 1);
      this.bar?.fillRoundedRect(
        width / 2 - barWidth / 2,
        height / 2 + 20,
        Math.max(1, barWidth * value),
        10,
        5,
      );
    });

    // Illustrator-delivered art lands here:
    //   this.load.atlas('pet', 'assets/pet.png', 'assets/pet.json');
  }

  create(): void {
    this.scene.start(SCENE.home);
  }
}

/**
 * First scene. Does the async work that must finish before anything renders:
 * load the save and apply the away period (§16 build order — offline
 * progression before everything else).
 *
 * Nothing is drawn here beyond a flat backdrop, so cold start stays fast.
 */

import Phaser from 'phaser';

import { BACKDROP } from '@/config/palette';
import { GameContext } from '@/core/GameContext';
import { SCENE } from '@/scenes/keys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.boot);
  }

  init(): void {
    this.cameras.main.setBackgroundColor(BACKDROP);
  }

  create(): void {
    const context = GameContext.from(this);

    context
      .boot()
      .catch((err: unknown) => {
        // A failed load already falls back to defaults inside SaveManager; this
        // only catches something more exotic. Never leave the player on a
        // blank screen.
        console.error('[Boot] failed', err);
      })
      .finally(() => {
        this.scene.start(SCENE.preload);
      });
  }
}

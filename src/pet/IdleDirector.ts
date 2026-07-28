/**
 * Unprompted idle scheduling and boredom escalation. Spec §10.
 *
 * Fires a random idle every 2.6-5.8s when the pet is not busy. After 12s
 * without a touch the pool is weighted toward attention-seeking animations.
 *
 * "This is the single biggest contributor to the pet feeling alive — do not cut
 * it for scope." The picker is a pure function so that claim stays testable.
 */

import Phaser from 'phaser';

import { IDLE } from '@/config/tuning';
import { pickIdle } from '@/pet/idlePolicy';
import type { PetAnimator } from '@/pet/PetAnimator';

export { idlePool, pickIdle } from '@/pet/idlePolicy';

export class IdleDirector {
  private readonly scene: Phaser.Scene;
  private readonly animator: PetAnimator;

  private timer: Phaser.Time.TimerEvent | null = null;
  private lastTouchAt: number;
  private paused = false;

  constructor(scene: Phaser.Scene, animator: PetAnimator) {
    this.scene = scene;
    this.animator = animator;
    this.lastTouchAt = scene.time.now;
  }

  start(): void {
    this.schedule();
  }

  stop(): void {
    this.timer?.remove();
    this.timer = null;
  }

  /** Any deliberate interaction resets the boredom countdown. */
  noteTouch(): void {
    this.lastTouchAt = this.scene.time.now;
  }

  /** Suspended during the mini-game, sheets and voice playback. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  get msSinceTouch(): number {
    return this.scene.time.now - this.lastTouchAt;
  }

  get isBored(): boolean {
    return this.msSinceTouch > IDLE.boredomAfterMs;
  }

  private schedule(): void {
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(
      Phaser.Math.Between(IDLE.minDelayMs, IDLE.maxDelayMs),
      () => {
        this.fire();
        this.schedule();
      },
    );
  }

  private fire(): void {
    // Never talk over a real interaction, and never fidget in its sleep.
    if (this.paused || this.animator.isSleeping || this.animator.isBusy) return;
    this.animator.play(pickIdle(this.msSinceTouch));
  }

  destroy(): void {
    this.stop();
  }
}

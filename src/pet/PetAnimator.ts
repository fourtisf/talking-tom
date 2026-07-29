/**
 * Named animation playback and blending. Spec §10.
 *
 * Every animation in the required set lives here, timed to match the prototype.
 * Two layers coexist:
 *
 *  - **ambient** loops (breathe, blink, tail sway, ear twitch) that never stop;
 *  - **one-shot** actions (squash, hop, eat, stretch, yawn, gaze, wag, perk)
 *    that take over a subset of bones and hand them back when done.
 *
 * `isBusy` lets `IdleDirector` stay out of the way of a real interaction.
 */

import Phaser from 'phaser';

import { ANIM } from '@/config/tuning';
import type { AnimName } from '@/pet/idlePolicy';
import type { PetRig } from '@/pet/PetRig';

// Names, durations and the idle policy live in a Phaser-free module so they can
// be unit-tested without a canvas. Re-exported here for callers that already
// import from the animator.
export {
  ANIM_DURATION_MS,
  ATTENTION_ANIMS,
  IDLE_ANIMS,
  type AnimName,
} from '@/pet/idlePolicy';

/** Internal slot names — one running animation per slot. */
type Slot = 'body' | 'gaze' | 'tail' | 'ears' | 'mouth';

export class PetAnimator {
  private readonly scene: Phaser.Scene;
  private readonly rig: PetRig;

  private readonly ambient: Phaser.Tweens.BaseTween[] = [];
  private readonly slots = new Map<Slot, Phaser.Tweens.BaseTween>();

  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private sleeping = false;
  private talking = false;
  private eating = false;

  /** Resting positions, captured once so animations always return home. */
  private readonly restRootY: number;
  private readonly restBall: { l: Phaser.Math.Vector2; r: Phaser.Math.Vector2 };

  constructor(scene: Phaser.Scene, rig: PetRig) {
    this.scene = scene;
    this.rig = rig;

    this.restRootY = rig.bone('root').y;
    this.restBall = {
      l: new Phaser.Math.Vector2(rig.bone('ballL').x, rig.bone('ballL').y),
      r: new Phaser.Math.Vector2(rig.bone('ballR').x, rig.bone('ballR').y),
    };

    this.startAmbient();
  }

  /** True while an action animation owns the pet. */
  get isBusy(): boolean {
    return this.talking || this.eating || this.slots.size > 0;
  }

  get isSleeping(): boolean {
    return this.sleeping;
  }

  /* ----------------------------- ambient ---------------------------- */

  private startAmbient(): void {
    const root = this.rig.bone('root');
    const tail = this.rig.bone('tail');

    this.ambient.push(
      this.scene.tweens.add({
        targets: root,
        scaleY: ANIM.breatheScaleY,
        duration: ANIM.breatheMs / 2,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
      this.scene.tweens.add({
        targets: tail,
        angle: { from: -8, to: 12 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );

    // Idle ear twitch, staggered so the two ears never move in lockstep, and
    // mirrored: one signed angle for both swings the pair sideways, which reads
    // as a lopsided head rather than a twitch.
    for (const [i, ear] of [this.rig.bone('earL'), this.rig.bone('earR')].entries()) {
      this.ambient.push(
        this.scene.tweens.add({
          targets: ear,
          angle: { from: 0, to: i === 0 ? -5 : 5 },
          duration: 3000,
          delay: i * 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      );
    }

    this.scheduleBlink();
  }

  private scheduleBlink(): void {
    this.blinkTimer?.remove();
    this.blinkTimer = this.scene.time.delayedCall(
      Phaser.Math.Between(ANIM.blinkEveryMsMin, ANIM.blinkEveryMsMax),
      () => {
        this.blink();
        this.scheduleBlink();
      },
    );
  }

  /** Eyelid scaleY 0 -> 1 -> 0. Not played while asleep; the lids are already shut. */
  blink(): void {
    if (this.sleeping) return;
    this.scene.tweens.add({
      targets: [this.rig.bone('lidL'), this.rig.bone('lidR')],
      scaleY: 1,
      duration: ANIM.blinkMs / 2,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  /* ---------------------------- one-shots --------------------------- */

  /**
   * Play a named action. Re-triggering an animation on a busy slot restarts
   * it, which is what repeated taps should feel like.
   */
  play(name: AnimName): void {
    /*
     * NOTHING MOVES HER WHILE SHE IS ASLEEP.
     *
     * `IdleDirector` already declines to fidget in its sleep, but the reward
     * flourishes call `play` directly and do not ask. That matters now that
     * sleeping means lying on the bed: `hop` and `stretch` tween the root back
     * to `restRootY`, which is where she STANDS, so a daily-login bonus landing
     * on a save that was asleep teleported her off the mattress and onto the
     * floor, mid-air, still horizontal.
     */
    if (this.sleeping) return;

    switch (name) {
      case 'squash':
        return this.squash();
      case 'hop':
        return this.hop();
      case 'stretch':
        return this.stretch();
      case 'yawn':
        return this.yawn();
      case 'tailWag':
        return this.tailWag();
      case 'earPerk':
        return this.earPerk();
      case 'gazeL':
        return this.gaze(-ANIM.gazeOffsetPx, 0);
      case 'gazeR':
        return this.gaze(ANIM.gazeOffsetPx, 0);
      case 'gazeU':
        return this.gaze(0, -ANIM.gazeUpOffsetPx);
      case 'blink':
        return this.blink();
      case 'eat':
        return this.eat();
      case 'breathe':
      case 'talk':
      case 'sleep':
        // Continuous states, driven by their own setters.
        return;
    }
  }

  /** Claim a slot, stopping whatever was using it. */
  private claim(slot: Slot, tween: Phaser.Tweens.BaseTween): void {
    this.slots.get(slot)?.stop();
    this.slots.set(slot, tween);
    tween.once(Phaser.Tweens.Events.TWEEN_COMPLETE, () => {
      if (this.slots.get(slot) === tween) this.slots.delete(slot);
    });
  }

  /** Any tap. 440ms with overshoot, matching the prototype's squash keyframes. */
  squash(): void {
    const root = this.rig.bone('root');
    root.setScale(1, 1);
    this.claim(
      'body',
      this.scene.tweens.chain({
        targets: root,
        tweens: [
          { scaleX: 1.12, scaleY: 0.87, duration: ANIM.squashMs * 0.22, ease: 'Quad.easeOut' },
          { scaleX: 0.94, scaleY: 1.08, duration: ANIM.squashMs * 0.33, ease: 'Sine.easeInOut' },
          { scaleX: 1, scaleY: 1, duration: ANIM.squashMs * 0.45, ease: 'Back.easeOut' },
        ],
      }),
    );
  }

  /** Reward and level-up. 620ms up-and-down with a squash on either end. */
  hop(): void {
    const root = this.rig.bone('root');
    const baseY = this.restRootY;
    this.claim(
      'body',
      this.scene.tweens.chain({
        targets: root,
        tweens: [
          { scaleX: 1.1, scaleY: 0.88, duration: ANIM.hopMs * 0.18, ease: 'Quad.easeOut' },
          {
            y: baseY - 46,
            scaleX: 0.94,
            scaleY: 1.08,
            duration: ANIM.hopMs * 0.32,
            ease: 'Quad.easeOut',
          },
          {
            y: baseY,
            scaleX: 1.08,
            scaleY: 0.9,
            duration: ANIM.hopMs * 0.32,
            ease: 'Quad.easeIn',
          },
          { scaleX: 1, scaleY: 1, duration: ANIM.hopMs * 0.18, ease: 'Back.easeOut' },
        ],
      }),
    );
  }

  /** Feeding: mouth flap plus a body bob. */
  eat(): void {
    if (this.eating) return;
    this.eating = true;
    this.rig.setMouth('open');

    const mouth = this.rig.bone('mouth');
    const root = this.rig.bone('root');

    const flap = this.scene.tweens.add({
      targets: mouth,
      scaleY: { from: 0.35, to: 1.15 },
      duration: 150,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const bob = this.scene.tweens.add({
      targets: root,
      y: this.restRootY - 6,
      duration: 150,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.scene.time.delayedCall(ANIM.eatMs, () => {
      flap.stop();
      bob.stop();
      mouth.setScale(1, 1);
      root.y = this.restRootY;
      this.eating = false;
      if (!this.talking) this.rig.setMouth('norm');
    });
  }

  /**
   * Voice playback. The mouth is driven by amplitude from the caller, not by a
   * canned loop (spec §9.3) — `setTalking(false)` restores the resting mouth.
   */
  setTalking(on: boolean): void {
    this.talking = on;
    const mouth = this.rig.bone('mouth');
    if (on) {
      this.rig.setMouth('open');
      mouth.setScale(1, 0.3);
    } else {
      mouth.setScale(1, 1);
      this.rig.setMouth('norm');
    }
  }

  /** 0..1 amplitude from the playback analyser -> mouth opening. */
  setMouthOpen(amount: number): void {
    if (!this.talking) return;
    this.rig.bone('mouth').scaleY = Phaser.Math.Clamp(amount, 0.15, 1.25);
  }

  /** Lids closed, slower breathing. */
  setSleeping(on: boolean): void {
    if (this.sleeping === on) return;
    this.sleeping = on;

    this.scene.tweens.add({
      targets: [this.rig.bone('lidL'), this.rig.bone('lidR')],
      scaleY: on ? 1 : 0,
      duration: 260,
      ease: 'Sine.easeOut',
    });

    // Retime the breathe loop rather than restarting it, so the pet does not
    // visibly hitch when it drops off.
    const breathe = this.ambient[0];
    if (breathe) {
      breathe.timeScale = on ? ANIM.breatheMs / ANIM.sleepBreatheMs : 1;
    }
    if (on) this.rig.setMouth('norm');
  }

  /** Eyeball group translate, ±7px, then back. */
  private gaze(dx: number, dy: number): void {
    const ballL = this.rig.bone('ballL');
    const ballR = this.rig.bone('ballR');
    const hold = Math.max(0, ANIM.gazeMs - 520);

    this.claim(
      'gaze',
      this.scene.tweens.chain({
        targets: [ballL, ballR],
        tweens: [
          {
            x: (_t: unknown, _k: unknown, _v: number, index: number) =>
              (index === 0 ? this.restBall.l.x : this.restBall.r.x) + dx,
            y: (_t: unknown, _k: unknown, _v: number, index: number) =>
              (index === 0 ? this.restBall.l.y : this.restBall.r.y) + dy,
            duration: 260,
            ease: 'Back.easeOut',
          },
          {
            delay: hold,
            x: (_t: unknown, _k: unknown, _v: number, index: number) =>
              index === 0 ? this.restBall.l.x : this.restBall.r.x,
            y: (_t: unknown, _k: unknown, _v: number, index: number) =>
              index === 0 ? this.restBall.l.y : this.restBall.r.y,
            duration: 260,
            ease: 'Sine.easeInOut',
          },
        ],
      }),
    );
  }

  private stretch(): void {
    const root = this.rig.bone('root');
    const baseY = this.restRootY;
    this.claim(
      'body',
      this.scene.tweens.chain({
        targets: root,
        tweens: [
          { scaleY: 1.13, y: baseY - 14, duration: ANIM.stretchMs * 0.3, ease: 'Sine.easeOut' },
          { scaleY: 0.93, y: baseY + 4, duration: ANIM.stretchMs * 0.25, ease: 'Sine.easeInOut' },
          { scaleY: 1, y: baseY, duration: ANIM.stretchMs * 0.45, ease: 'Back.easeOut' },
        ],
      }),
    );
  }

  private yawn(): void {
    if (this.talking || this.eating) return;
    const mouth = this.rig.bone('mouth');
    this.rig.setMouth('open');

    this.scene.tweens.add({
      targets: [this.rig.bone('lidL'), this.rig.bone('lidR')],
      scaleY: 0.85,
      duration: ANIM.yawnMs * 0.35,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    this.claim(
      'mouth',
      this.scene.tweens.chain({
        targets: mouth,
        tweens: [
          { scaleX: 1.5, scaleY: 2.1, duration: ANIM.yawnMs * 0.35, ease: 'Sine.easeOut' },
          {
            delay: ANIM.yawnMs * 0.25,
            scaleX: 1,
            scaleY: 1,
            duration: ANIM.yawnMs * 0.4,
            ease: 'Sine.easeIn',
          },
        ],
        onComplete: () => {
          if (!this.talking && !this.eating) this.rig.setMouth('norm');
        },
      }),
    );
  }

  private tailWag(): void {
    this.claim(
      'tail',
      this.scene.tweens.add({
        targets: this.rig.bone('tail'),
        angle: { from: -16, to: 20 },
        duration: ANIM.tailWagCycleMs / 2,
        yoyo: true,
        repeat: ANIM.tailWagCycles - 1,
        ease: 'Sine.easeInOut',
      }),
    );
  }

  private earPerk(): void {
    // Mirrored, so the pair flicks outward instead of leaning as a unit.
    this.claim(
      'ears',
      this.scene.tweens.add({
        targets: [this.rig.bone('earL'), this.rig.bone('earR')],
        angle: (_target: unknown, _key: string, _value: number, index: number) =>
          index === 0 ? -13 : 13,
        duration: ANIM.earPerkCycleMs / 2,
        yoyo: true,
        repeat: ANIM.earPerkCycles - 1,
        ease: 'Sine.easeInOut',
      }),
    );
  }

  destroy(): void {
    this.blinkTimer?.remove();
    for (const tween of this.ambient) tween.stop();
    for (const tween of this.slots.values()) tween.stop();
    this.ambient.length = 0;
    this.slots.clear();
  }
}

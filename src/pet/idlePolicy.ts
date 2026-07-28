/**
 * Animation names and the idle-selection policy. Spec §10.
 *
 * Deliberately Phaser-free: the boredom escalation is the single biggest
 * contributor to the pet feeling alive, so it is worth being able to test the
 * rule without standing up a canvas. `PetAnimator` and `IdleDirector` both
 * import from here.
 */

import { ANIM, IDLE } from '@/config/tuning';

export type AnimName =
  | 'breathe'
  | 'blink'
  | 'squash'
  | 'hop'
  | 'eat'
  | 'talk'
  | 'sleep'
  | 'gazeL'
  | 'gazeR'
  | 'gazeU'
  | 'stretch'
  | 'yawn'
  | 'tailWag'
  | 'earPerk';

/** The idles `IdleDirector` may pick from. */
export const IDLE_ANIMS: readonly AnimName[] = [
  'gazeL',
  'gazeR',
  'gazeU',
  'stretch',
  'yawn',
  'tailWag',
  'earPerk',
];

/** Idles that read as "look at me" — weighted up once the player goes quiet. */
export const ATTENTION_ANIMS: readonly AnimName[] = ['tailWag', 'earPerk', 'stretch'];

/** How long each animation occupies the pet. */
export const ANIM_DURATION_MS: Readonly<Record<AnimName, number>> = {
  breathe: ANIM.breatheMs,
  blink: ANIM.blinkMs,
  squash: ANIM.squashMs,
  hop: ANIM.hopMs,
  eat: ANIM.eatMs,
  talk: 0,
  sleep: 0,
  gazeL: ANIM.gazeMs,
  gazeR: ANIM.gazeMs,
  gazeU: ANIM.gazeMs,
  stretch: ANIM.stretchMs,
  yawn: ANIM.yawnMs,
  tailWag: ANIM.tailWagCycleMs * ANIM.tailWagCycles,
  earPerk: ANIM.earPerkCycleMs * ANIM.earPerkCycles,
};

/**
 * Build the pool for this pick. Past the boredom threshold the attention
 * animations are appended, raising their probability without excluding the
 * quieter idles — the pet gets needier, not robotic.
 */
export function idlePool(msSinceTouch: number): AnimName[] {
  const pool = [...IDLE_ANIMS];
  if (msSinceTouch > IDLE.boredomAfterMs) {
    for (let i = 0; i < IDLE.boredomWeight; i++) {
      pool.push(...ATTENTION_ANIMS);
    }
  }
  return pool;
}

/** Pick an idle. `random` is injectable so tests can pin the choice. */
export function pickIdle(msSinceTouch: number, random: () => number = Math.random): AnimName {
  const pool = idlePool(msSinceTouch);
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  // `pool` is never empty: IDLE_ANIMS is a non-empty literal.
  return pool[index] as AnimName;
}

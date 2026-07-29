/**
 * Stats -> facial expression. Spec §10.
 *
 * Expression is resolved from the LOWEST stat, the same rule the prototype
 * uses: one miserable stat is enough to make the pet look miserable, however
 * good the other three are.
 *
 * Pure functions plus a thin binder, so the mapping is testable without a rig.
 */

import { MOOD } from '@/config/tuning';
import type { MoodName, PetStats, StatKey } from '@/core/types';
import { STAT_KEYS } from '@/core/types';
import type { MouthShape } from '@/pet/PetArt';
import type { PetRig } from '@/pet/PetRig';

export interface MoodContext {
  isSleeping: boolean;
  isTalking: boolean;
  isEating: boolean;
}

export function lowestStat(stats: Readonly<PetStats>): { key: StatKey; value: number } {
  let key: StatKey = 'hunger';
  let value = Number.POSITIVE_INFINITY;
  for (const k of STAT_KEYS) {
    if (stats[k] < value) {
      value = stats[k];
      key = k;
    }
  }
  return { key, value };
}

/**
 * Transient states win over stat-driven ones: a pet mid-bite reads as eating,
 * not as sad, even if it was starving a moment ago.
 */
export function resolveMood(stats: Readonly<PetStats>, ctx: MoodContext): MoodName {
  if (ctx.isSleeping) return 'sleep';
  if (ctx.isTalking) return 'talk';
  if (ctx.isEating) return 'eat';

  const { value } = lowestStat(stats);
  if (value < MOOD.sadBelow) return 'sad';
  if (value > MOOD.joyAbove) return 'joy';
  return 'neutral';
}

export function mouthForMood(mood: MoodName): MouthShape {
  switch (mood) {
    case 'joy':
      return 'joy';
    case 'sad':
      return 'sad';
    case 'talk':
    case 'eat':
      return 'open';
    case 'sleep':
    case 'neutral':
      return 'norm';
  }
}

/** Blush strength, 0..1. The pet pinks up when it is happy. */
export function blushForMood(mood: MoodName): number {
  return mood === 'joy' ? 0.88 : 0.42;
}

/** Eyelid rest position, 0 (wide open) .. 1 (shut). */
export function lidForMood(mood: MoodName): number {
  switch (mood) {
    case 'sleep':
      return 1;
    case 'sad':
      // A hint of droop, not half-shut. At 0.32 the lid ate the top third of
      // each eye and, with the frown, the whole face read as crying.
      return 0.14;
    default:
      return 0;
  }
}

/** Applies a resolved mood to a rig. The only place the two meet. */
export class MoodResolver {
  private readonly rig: PetRig;
  private current: MoodName = 'neutral';

  constructor(rig: PetRig) {
    this.rig = rig;
  }

  get mood(): MoodName {
    return this.current;
  }

  apply(stats: Readonly<PetStats>, ctx: MoodContext): MoodName {
    const mood = resolveMood(stats, ctx);
    if (mood === this.current) return mood;
    this.current = mood;

    // `talk` and `eat` own the mouth themselves — the animator is driving it.
    if (mood !== 'talk' && mood !== 'eat') {
      this.rig.setMouth(mouthForMood(mood));
    }

    this.rig.bone('blush').setAlpha(blushForMood(mood));

    // Sleep lids are the animator's job (it tweens them); everything else
    // settles the resting lid position here.
    if (mood !== 'sleep') {
      const lid = lidForMood(mood);
      this.rig.bone('lidL').setScale(1, lid);
      this.rig.bone('lidR').setScale(1, lid);
    }

    return mood;
  }
}

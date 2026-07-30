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
  /**
   * Mid-scrub. Optional because absence genuinely means "not being bathed" —
   * this is a bag of transient states, not an exhaustive description.
   */
  isBathing?: boolean;
  /** Poked once too often, and not over it yet. */
  isCross?: boolean;
  /** She needs the litter tray and has not been taken. */
  isDesperate?: boolean;
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
  /*
   * Cross beats everything she is awake for, including being scrubbed. If she
   * has just been smacked, a full clean meter does not make her happy about it
   * — and a pet whose sulk can be papered over by a good stat is a pet whose
   * sulk means nothing.
   */
  if (ctx.isCross) return 'angry';
  if (ctx.isTalking) return 'talk';
  if (ctx.isEating) return 'eat';
  // Being scrubbed is enjoyable whatever the meters say, and the meters say
  // "filthy" for the whole first half of a bath — without this she scowls
  // through the part the player is meant to enjoy.
  if (ctx.isBathing) return 'joy';
  /*
   * Needing the tray shows on her face.
   *
   * This need has no meter, so her expression is doing work here that the dock
   * does for the other four — a player who missed the bubble should still be
   * able to tell something is wrong by looking at her. It sits BELOW bathing:
   * being scrubbed is the one thing she is unambiguously enjoying, and a sad
   * face through a bath is the bug that put `isBathing` here in the first
   * place.
   */
  if (ctx.isDesperate) return 'sad';

  const { value } = lowestStat(stats);
  if (value < MOOD.sadBelow) return 'sad';
  if (value > MOOD.joyAbove) return 'joy';
  return 'neutral';
}

export function mouthForMood(mood: MoodName): MouthShape {
  switch (mood) {
    case 'angry':
      return 'cross';
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
  if (mood === 'joy') return 0.88;
  // The blush comes off when she is cross. It is the one mark on her face that
  // reads as pleased, and leaving it on undoes the whole expression.
  if (mood === 'angry') return 0.12;
  return 0.42;
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
    case 'angry':
      // Lower than sad. A narrowed eye is the whole difference between a face
      // that is upset with you and a face that is upset.
      return 0.3;
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

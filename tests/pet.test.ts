/**
 * Pet behaviour that can be reasoned about without a canvas: mood resolution
 * and the idle director's pool weighting.
 */

import { describe, expect, it } from 'vitest';

import {
  blushForMood,
  lidForMood,
  lowestStat,
  mouthForMood,
  resolveMood,
} from '@/pet/MoodResolver';
import { ATTENTION_ANIMS, IDLE_ANIMS, idlePool, pickIdle } from '@/pet/idlePolicy';
import { IDLE, MOOD } from '@/config/tuning';
import type { PetStats } from '@/core/types';

const AWAKE = { isSleeping: false, isTalking: false, isEating: false };

function stats(overrides: Partial<PetStats> = {}): PetStats {
  return { hunger: 60, energy: 60, fun: 60, clean: 60, ...overrides };
}

describe('MoodResolver (§10)', () => {
  it('resolves from the LOWEST stat, not the average', () => {
    // Three stats are excellent; one is dire. The pet is sad.
    expect(resolveMood(stats({ hunger: 100, energy: 100, clean: 100, fun: 10 }), AWAKE)).toBe('sad');
    expect(lowestStat(stats({ fun: 10 }))).toEqual({ key: 'fun', value: 10 });
  });

  it('is joyful only when every stat clears the joy threshold', () => {
    const joyful = MOOD.joyAbove + 1;
    expect(resolveMood(stats({ hunger: joyful, energy: joyful, fun: joyful, clean: joyful }), AWAKE)).toBe('joy');
    expect(resolveMood(stats({ hunger: joyful, energy: joyful, fun: joyful, clean: MOOD.joyAbove }), AWAKE)).toBe('neutral');
  });

  it('sits neutral between the two thresholds', () => {
    expect(resolveMood(stats({ hunger: MOOD.sadBelow }), AWAKE)).toBe('neutral');
    expect(resolveMood(stats({ hunger: MOOD.sadBelow - 1 }), AWAKE)).toBe('sad');
  });

  it('lets transient states win over the stat-driven mood', () => {
    const starving = stats({ hunger: 5 });
    expect(resolveMood(starving, { ...AWAKE, isSleeping: true })).toBe('sleep');
    expect(resolveMood(starving, { ...AWAKE, isTalking: true })).toBe('talk');
    expect(resolveMood(starving, { ...AWAKE, isEating: true })).toBe('eat');
    // Sleep outranks talking, which outranks eating.
    expect(resolveMood(starving, { isSleeping: true, isTalking: true, isEating: true })).toBe('sleep');
  });

  it('maps each mood to a mouth, a blush and a lid position', () => {
    expect(mouthForMood('joy')).toBe('joy');
    expect(mouthForMood('sad')).toBe('sad');
    expect(mouthForMood('talk')).toBe('open');
    expect(mouthForMood('eat')).toBe('open');
    expect(mouthForMood('neutral')).toBe('norm');
    expect(mouthForMood('sleep')).toBe('norm');

    expect(blushForMood('joy')).toBeGreaterThan(blushForMood('neutral'));

    expect(lidForMood('sleep')).toBe(1);
    expect(lidForMood('neutral')).toBe(0);
    expect(lidForMood('sad')).toBeGreaterThan(0);
    expect(lidForMood('sad')).toBeLessThan(1);
  });
});

describe('IdleDirector (§10)', () => {
  it('offers every idle before the boredom threshold', () => {
    const pool = idlePool(0);
    expect(new Set(pool)).toEqual(new Set(IDLE_ANIMS));
    expect(pool).toHaveLength(IDLE_ANIMS.length);
  });

  it('weights the pool toward attention-seeking once the player goes quiet', () => {
    const bored = idlePool(IDLE.boredomAfterMs + 1);
    expect(bored.length).toBe(IDLE_ANIMS.length + ATTENTION_ANIMS.length * IDLE.boredomWeight);

    for (const anim of ATTENTION_ANIMS) {
      const calm = idlePool(0).filter((a) => a === anim).length;
      const needy = bored.filter((a) => a === anim).length;
      expect(needy).toBeGreaterThan(calm);
    }
  });

  it('still offers the quiet idles when bored — needier, not robotic', () => {
    const bored = idlePool(IDLE.boredomAfterMs + 1);
    for (const anim of IDLE_ANIMS) {
      expect(bored).toContain(anim);
    }
  });

  it('does not escalate exactly at the threshold, only past it', () => {
    expect(idlePool(IDLE.boredomAfterMs)).toHaveLength(IDLE_ANIMS.length);
  });

  it('picks in range for every possible random value', () => {
    for (const r of [0, 0.001, 0.5, 0.999, 1]) {
      expect(IDLE_ANIMS).toContain(pickIdle(0, () => r));
      expect(idlePool(999_999)).toContain(pickIdle(999_999, () => r));
    }
  });
});

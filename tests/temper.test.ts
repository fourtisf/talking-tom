/**
 * What separates a pat from a smack.
 *
 * This is a rule about timing, which is the kind that looks right in a
 * screenshot and is wrong in the hand. Two things are defended here and they
 * pull in opposite directions: an excited child tapping happily must never be
 * told off, and someone deliberately hammering on the cat must be. The gap
 * between those two behaviours is the whole design, so it gets measured rather
 * than eyeballed.
 *
 * And she always forgives. Every path out of `cross` is time.
 */

import { describe, expect, it } from 'vitest';

import { CALM, forgive, isCross, touch, type Temper } from '@/pet/temper';
import { TEMPER } from '@/config/tuning';

/** Tap `n` times, `everyMs` apart, starting at `t0`. */
function tapping(n: number, everyMs: number, t0 = 1000) {
  let temper: Temper = CALM;
  const reactions: string[] = [];
  for (let i = 0; i < n; i++) {
    const result = touch(temper, t0 + i * everyMs);
    temper = result.temper;
    reactions.push(result.reaction);
  }
  return { temper, reactions, endMs: t0 + (n - 1) * everyMs };
}

describe('a pat', () => {
  it('is what a single touch is', () => {
    expect(touch(CALM, 1000).reaction).toBe('pat');
  });

  /**
   * The case that decides whether this feature is a bug. Happy tapping is the
   * free way to keep `fun` up — it decays fastest of the four on purpose — and
   * a player who is patting her affectionately for a minute must never be told
   * she does not like it.
   */
  it('stays a pat forever, however long you keep it up', () => {
    const { reactions } = tapping(40, TEMPER.pokeWindowMs + 50);
    expect(new Set(reactions)).toEqual(new Set(['pat']));
  });

  /**
   * Two taps a second, kept up for half a minute — an excited child having a
   * nice time. The exponential ceiling for that rate is 2.8, below the flinch
   * threshold, so she never so much as recoils however long it goes on. This is
   * the test that failed against the first, linear cooling rule.
   */
  it('is still a pat at a brisk but human rate, indefinitely', () => {
    const { reactions } = tapping(60, 500);
    expect(new Set(reactions)).toEqual(new Set(['pat']));
  });

  it('warns but never punishes at an in-between rate', () => {
    const { reactions } = tapping(60, 300);
    expect(reactions).toContain('flinch');
    expect(reactions).not.toContain('cross');
  });
});

describe('a smack', () => {
  it('gets a flinch before it gets a sulk, so there is a warning', () => {
    const { reactions } = tapping(20, 60);
    expect(reactions.indexOf('flinch')).toBeGreaterThan(-1);
    expect(reactions.indexOf('flinch')).toBeLessThan(reactions.indexOf('cross'));
  });

  it('makes her cross after about a second of real hammering', () => {
    const { reactions } = tapping(20, 60);
    const first = reactions.indexOf('cross');
    expect(first).toBeGreaterThan(-1);
    // Not on the second tap, and not after twenty of them either.
    expect(first).toBeGreaterThan(3);
    expect(first).toBeLessThan(12);
  });

  it('needs real hammering — the first two taps are always free', () => {
    const { reactions } = tapping(2, 50);
    expect(reactions).toEqual(['pat', 'pat']);
  });
});

describe('she always comes back', () => {
  it('is cross for exactly as long as the sulk lasts', () => {
    const { temper, endMs } = tapping(20, 60);
    expect(isCross(temper, endMs)).toBe(true);
    expect(isCross(temper, temper.crossUntilMs - 1)).toBe(true);
    expect(isCross(temper, temper.crossUntilMs)).toBe(false);
    // And it started when she snapped, partway through the burst.
    expect(temper.crossUntilMs).toBeLessThan(endMs + TEMPER.sulkMs);
  });

  /**
   * The one that makes this safe to ship. Poking a sulking cat must not extend
   * the sulk, or a player who does not understand what is happening can never
   * get out of it by doing the only thing they know how to do.
   */
  it('cannot be made worse by carrying on', () => {
    const { temper, endMs } = tapping(20, 60);
    let cross = temper;
    for (let i = 1; i <= 20; i++) cross = touch(cross, endMs + i * 60).temper;
    expect(cross.crossUntilMs).toBe(temper.crossUntilMs);
    expect(isCross(cross, temper.crossUntilMs)).toBe(false);
  });

  it('lets it go early when something kind happens', () => {
    const { temper, endMs } = tapping(20, 60);
    expect(isCross(forgive(temper), endMs)).toBe(false);
  });

  it('starts fresh after a pause, however bad the last burst was', () => {
    const { temper, endMs } = tapping(4, 60);
    const later = touch(temper, endMs + TEMPER.pokeWindowMs + 1);
    expect(later.reaction).toBe('pat');
    expect(later.temper.heat).toBe(1);
  });
});

describe('the numbers are set where they were meant to be', () => {
  it('warns before it punishes', () => {
    expect(TEMPER.pokesToFlinch).toBeLessThan(TEMPER.pokesToCross);
  });

  it('costs only fun — the stat the player was trying to raise', () => {
    expect(TEMPER.funLoss).toBeGreaterThan(0);
  });

  it('forgives in well under a minute', () => {
    expect(TEMPER.sulkMs).toBeLessThanOrEqual(15_000);
  });
});

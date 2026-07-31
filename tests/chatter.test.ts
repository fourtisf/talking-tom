/**
 * Her opinions, and — the part that actually matters — her silences.
 *
 * A talking pet is one tuning mistake away from being the reason someone
 * uninstalls, and the mistake is never the words. It is saying three things in
 * four seconds, saying the same thing twice running, or announcing that she is
 * fine while her hunger bar is red. All three are timing and selection, both
 * of which are arithmetic, and none of them reproduce reliably by sitting and
 * watching the game.
 */

import { describe, expect, it } from 'vitest';

import { ALL_POOLS, CHATTER, Chatter, poolFor, worstNeed } from '@/pet/chatter';
import { EN } from '@/i18n/en';
import type { PetStats } from '@/core/types';

const FINE: PetStats = { hunger: 90, energy: 90, fun: 90, clean: 90 };
const stats = (over: Partial<PetStats> = {}): PetStats => ({ ...FINE, ...over });

/** A generator that walks 0, 0.1, 0.2 … so draws are deterministic. */
function ramp(start = 0): () => number {
  let n = start;
  return () => {
    n = (n + 0.1) % 1;
    return n;
  };
}

describe('what she notices', () => {
  it('says nothing about a stat that is merely not full', () => {
    expect(worstNeed(stats({ hunger: CHATTER.needBelow + 1 }))).toBeNull();
  });

  /**
   * Ordered, not weighted. A random pick across the low stats produces a cat
   * who mentions being bored while she is starving, and the player can see all
   * four meters — so that does not read as personality, it reads as the game
   * not knowing its own state.
   */
  it('complains about the worst thing, not a random thing', () => {
    expect(worstNeed(stats({ hunger: 20, fun: 40, clean: 50 }))).toBe('hunger');
    expect(worstNeed(stats({ hunger: 50, fun: 12 }))).toBe('fun');
  });

  it('scales the welcome-back line to how long you were gone', () => {
    const at = (hoursAway: number) =>
      poolFor({ occasion: 'return', stats: FINE, hoursAway, nowMs: 0 })?.stem;
    expect(at(0.5)).toBeUndefined();
    expect(at(2)).toBe('chat.back.short');
    expect(at(9)).toBe('chat.back.long');
    expect(at(50)).toBe('chat.back.ages');
  });
});

describe('when she keeps quiet', () => {
  it('will not say two things inside the floor', () => {
    const c = new Chatter(ramp());
    expect(c.pick({ occasion: 'fed', stats: FINE, hoursAway: 0, nowMs: 10_000 })).not.toBeNull();
    // Feeding her can tip an idle beat a moment later. Without the floor she
    // says two things in three seconds and reads as broken rather than chatty.
    expect(
      c.pick({ occasion: 'idle', stats: stats({ hunger: 10 }), hoursAway: 0, nowMs: 11_000 }),
    ).toBeNull();
    expect(
      c.pick({ occasion: 'idle', stats: stats({ hunger: 10 }), hoursAway: 0, nowMs: 40_000 }),
    ).not.toBeNull();
  });

  it('holds an occasion to its own cooldown as well', () => {
    const c = new Chatter(ramp());
    const low = stats({ hunger: 10 });
    let t = 100_000;
    expect(c.pick({ occasion: 'idle', stats: low, hoursAway: 0, nowMs: t })).not.toBeNull();
    t += CHATTER.cooldownMs.idle - 1000;
    expect(c.pick({ occasion: 'idle', stats: low, hoursAway: 0, nowMs: t })).toBeNull();
    t += 2000;
    expect(c.pick({ occasion: 'idle', stats: low, hoursAway: 0, nowMs: t })).not.toBeNull();
  });

  it('mostly says nothing at all when she is fine', () => {
    // The `happy` pool is real but rationed. A pet who announces she is fine
    // every idle beat is worse than one who complains, because at least the
    // complaint is information.
    const c = new Chatter(ramp());
    let spoke = 0;
    for (let i = 0; i < 40; i++) {
      if (c.pick({ occasion: 'idle', stats: FINE, hoursAway: 0, nowMs: i * 60_000 })) spoke++;
    }
    expect(spoke).toBeGreaterThan(0);
    expect(spoke).toBeLessThan(24);
  });

  it('forgets its timings on reset, because Phaser reuses the scene', () => {
    const c = new Chatter(ramp());
    expect(c.pick({ occasion: 'fed', stats: FINE, hoursAway: 0, nowMs: 500_000 })).not.toBeNull();
    c.reset();
    // A scene restarted after the first line would otherwise open mute — the
    // clock is `scene.time.now`, which restarts near zero, so every `nowMs`
    // would look like it came BEFORE the remembered one.
    expect(c.pick({ occasion: 'fed', stats: FINE, hoursAway: 0, nowMs: 10 })).not.toBeNull();
  });
});

describe('what she actually says', () => {
  it('never repeats a line back to back', () => {
    // Forced worst case: a generator that always wants index 0.
    const c = new Chatter(() => 0);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      const line = c.pick({
        occasion: 'idle',
        stats: stats({ hunger: 5 }),
        hoursAway: 0,
        nowMs: i * 60_000,
      });
      if (line) seen.push(line.key);
    }
    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  /**
   * Every line a pool can draw has to exist in the catalogue.
   *
   * `pool.count` and the number of `chat.*` keys are two hand-maintained lists
   * in different files, and nothing else checks that they agree. A pool one
   * over its catalogue shows the player the raw key — and only for one index
   * in four, so it survives any amount of playing.
   */
  it('can only draw keys the catalogue has', () => {
    // Walked exhaustively rather than sampled. Sampling through `pick` is at
    // the mercy of the cooldowns and the no-repeat nudge, and it reached nine
    // of the forty-one keys — a pool could be two over its catalogue and pass.
    let checked = 0;
    for (const pool of ALL_POOLS) {
      for (let i = 1; i <= pool.count; i++) {
        expect(EN).toHaveProperty(`${pool.stem}.${i}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('has no catalogue lines that no pool can reach', () => {
    // The other direction, which the first check cannot see: a line added to
    // en.ts without bumping `count` is dead copy nobody will ever read.
    const reachable = new Set(
      ALL_POOLS.flatMap((p) => Array.from({ length: p.count }, (_, i) => `${p.stem}.${i + 1}`)),
    );
    const inCatalogue = Object.keys(EN).filter((k) => k.startsWith('chat.'));
    expect(inCatalogue.length).toBeGreaterThan(0);
    for (const key of inCatalogue) expect(reachable).toContain(key);
  });

  it('gives the return lines the hours they interpolate', () => {
    const c = new Chatter(() => 0.99);
    const line = c.pick({ occasion: 'return', stats: FINE, hoursAway: 9.7, nowMs: 0 });
    expect(line?.params['hours']).toBe(9);
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { Progression, levelProgress, xpForLevel } from '@/core/Progression';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import {
  CONTENT_GATES,
  EARN,
  FOODS,
  UNLOCK_LEVEL,
  WEARABLES,
  XP_AWARDS,
  XP_CURVE,
} from '@/config/tuning';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

function setup(level = 1, xp = 0) {
  const save = createDefaultSave(T0);
  save.level = level;
  save.xp = xp;
  save.gems = 0;
  const state = new GameState(save);
  const economy = new Economy(state);
  return { state, economy, progression: new Progression(state, economy) };
}

describe('xp curve (§8)', () => {
  it('is floor(base * n^exponent), read from tuning', () => {
    for (const n of [1, 2, 3, 5, 10, 20, 50]) {
      expect(xpForLevel(n)).toBe(Math.floor(XP_CURVE.base * Math.pow(n, XP_CURVE.exponent)));
    }
  });

  it('rises monotonically', () => {
    expect(xpForLevel(1)).toBe(XP_CURVE.base);
    for (let n = 1; n < 40; n++) {
      expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
    }
  });

  /**
   * The curve is not just "some increasing function" — it is a retention
   * schedule, and it was reshaped because the old one starved the player.
   *
   * At 80^1.35 an ACTIVE player (~155 XP/day: three daily tasks plus normal
   * play) waited 21 days between the fifth and sixth hats and 35 between the
   * sixth and seventh. Pinning the literals alone would let someone restore
   * exactly that by editing two numbers and updating one assertion, so this
   * asserts the PROPERTY the numbers exist to produce.
   */
  it('keeps a reward within reach through the first month', () => {
    const XP_PER_DAY = 155;
    const dayReaching = (target: number): number => {
      let cumulative = 0;
      for (let level = 1; level < target; level++) cumulative += xpForLevel(level);
      return cumulative / XP_PER_DAY;
    };

    // A month of play should carry a player well into double-digit levels;
    // every level pays gems, and gems buy hats, so a level IS a reward.
    expect(dayReaching(11)).toBeLessThan(30);

    let previous = 0;
    let worstGap = 0;
    for (let level = 2; level <= 12; level++) {
      const day = dayReaching(level);
      worstGap = Math.max(worstGap, day - previous);
      previous = day;
    }
    expect(worstGap).toBeLessThan(7);
  });

  it('reports fractional progress through the current level', () => {
    expect(levelProgress(1, 0)).toBe(0);
    expect(levelProgress(1, xpForLevel(1) / 2)).toBeCloseTo(0.5, 6);
    expect(levelProgress(1, 999)).toBe(1);
  });
});

describe('Progression', () => {
  it('awards the tabled xp for each action', () => {
    const { state, progression } = setup();
    progression.award('pet');
    expect(state.xp).toBe(XP_AWARDS.pet);
    progression.award('feed');
    expect(state.xp).toBe(XP_AWARDS.pet + XP_AWARDS.feed);
  });

  it('scales by a multiplier — mini-game pays per catch', () => {
    const { state, progression } = setup();
    progression.award('miniGameCatch', 5);
    expect(state.xp).toBe(XP_AWARDS.miniGameCatch * 5);
  });

  it('levels up, carries the remainder, and pays gems through Economy', () => {
    // Derived from the curve, not pinned to it: this test is about carrying a
    // remainder across a level boundary, and it should keep testing that after
    // the next rebalance rather than becoming an arithmetic assertion.
    const REMAINDER = 4;
    const { state, progression } = setup(1, xpForLevel(1) - XP_AWARDS.feed + REMAINDER);
    const levelUp = vi.fn();
    progression.events.on('levelUp', levelUp);

    progression.award('feed');

    expect(state.level).toBe(2);
    expect(state.xp).toBe(REMAINDER);
    expect(state.gems).toBe(EARN.gemsPerLevel);
    expect(levelUp).toHaveBeenCalledWith({ level: 2, gemsAwarded: EARN.gemsPerLevel });
  });

  it('crosses several levels in one award', () => {
    const { state, progression } = setup(1, 0);
    // Enough to clear two boundaries but not three, whatever the curve is.
    const total = xpForLevel(1) + xpForLevel(2) + 1;
    const catches = Math.ceil(total / XP_AWARDS.miniGameCatch);
    const awarded = catches * XP_AWARDS.miniGameCatch;

    progression.award('miniGameCatch', catches);

    expect(state.level).toBe(3);
    expect(state.xp).toBe(awarded - xpForLevel(1) - xpForLevel(2));
    expect(state.gems).toBe(EARN.gemsPerLevel * 2);
  });

  it('gates content on level (§8 / §13)', () => {
    const { state, progression } = setup(1);
    expect(progression.isUnlocked('monetisation')).toBe(false);
    expect(progression.isUnlocked('secondMiniGame')).toBe(false);

    state.setProgress(UNLOCK_LEVEL.monetisation, 0);
    expect(progression.isUnlocked('monetisation')).toBe(true);
    expect(progression.isUnlocked('secondMiniGame')).toBe(false);

    state.setProgress(UNLOCK_LEVEL.secondMiniGame, 0);
    expect(progression.isUnlocked('secondMiniGame')).toBe(true);
  });

  /**
   * The content switch, and the line it must not cross.
   *
   * `CONTENT_GATES.byLevel` is off, so everything a player can BUY or PLAY is
   * available from level 1 and only the price is in the way. The monetisation
   * gate is not content and must survive that: §13 promises a brand-new player
   * no ads and no store, and a switch about wearing hats has no business
   * putting a rewarded-video button in front of someone ninety seconds in.
   */
  describe('content gates', () => {
    it('opens every food, hat and outfit at level 1', () => {
      const { progression } = setup(1);
      const gated = [...FOODS, ...WEARABLES].filter(
        (item) => !progression.isLevelReached(item.unlockLevel),
      );
      expect(gated.map((i) => i.id)).toEqual([]);
    });

    it('opens the second mini-game at level 1', () => {
      const { progression } = setup(1);
      expect(progression.isLevelReached(UNLOCK_LEVEL.secondMiniGame)).toBe(true);
    });

    it('leaves the prices exactly where they were', () => {
      // If this ever passes trivially the switch has been over-applied: the
      // whole point is that the shop is still a shop.
      expect(WEARABLES.every((w) => w.price > 0)).toBe(true);
      expect(FOODS.some((f) => f.cost > 0)).toBe(true);
      expect(WEARABLES.some((w) => w.currency === 'gems')).toBe(true);
    });

    it('does NOT open monetisation — that is a promise, not pacing', () => {
      const { progression } = setup(1);
      expect(progression.isUnlocked('monetisation')).toBe(false);
      expect(CONTENT_GATES.byLevel).toBe(false);
    });

    it('keeps the pacing on record, so the switch can be flipped back', () => {
      // The unlockLevel numbers must NOT have been rewritten to 1 — they are
      // what `XP_CURVE`'s schedule was derived against.
      expect(Math.max(...WEARABLES.map((w) => w.unlockLevel))).toBeGreaterThan(1);
      expect(Math.max(...FOODS.map((f) => f.unlockLevel))).toBeGreaterThan(1);
    });
  });

  /**
   * Every gate must have something on the other side of it. A gate referenced
   * only by this file is a promise made to a player that nothing keeps, which
   * is what `bedroomDecor` was for the whole of its life.
   */
  it('has no gate that nothing in the game reads', () => {
    const ROOT = fileURLToPath(new URL('../src', import.meta.url));
    const read = (dir: string): string => {
      let text = '';
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) text += read(full);
        else if (extname(entry) === '.ts' && !full.endsWith('tuning.ts')) text += readFileSync(full, 'utf8');
      }
      return text;
    };
    const source = read(ROOT);
    const orphans = Object.keys(UNLOCK_LEVEL).filter((gate) => !source.includes(gate));
    expect(orphans).toEqual([]);
  });
});

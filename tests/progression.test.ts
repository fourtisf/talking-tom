import { describe, expect, it, vi } from 'vitest';

import { Progression, levelProgress, xpForLevel } from '@/core/Progression';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import { EARN, UNLOCK_LEVEL, XP_AWARDS } from '@/config/tuning';

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
  it('is floor(80 * n^1.35)', () => {
    for (const n of [1, 2, 3, 5, 10, 20, 50]) {
      expect(xpForLevel(n)).toBe(Math.floor(80 * Math.pow(n, 1.35)));
    }
  });

  it('starts at 80 and rises monotonically', () => {
    expect(xpForLevel(1)).toBe(80);
    for (let n = 1; n < 40; n++) {
      expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
    }
  });

  it('reports fractional progress through the current level', () => {
    expect(levelProgress(1, 0)).toBe(0);
    expect(levelProgress(1, 40)).toBeCloseTo(0.5, 6);
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
    const { state, progression } = setup(1, 75);
    const levelUp = vi.fn();
    progression.events.on('levelUp', levelUp);

    progression.award('feed'); // +9 -> 84, level cost 80

    expect(state.level).toBe(2);
    expect(state.xp).toBe(4);
    expect(state.gems).toBe(EARN.gemsPerLevel);
    expect(levelUp).toHaveBeenCalledWith({ level: 2, gemsAwarded: EARN.gemsPerLevel });
  });

  it('crosses several levels in one award', () => {
    const { state, progression } = setup(1, 0);
    // L1 costs 80, L2 costs 203 => 300 xp lands in level 3.
    progression.award('miniGameCatch', 100); // 3 * 100 = 300
    expect(state.level).toBe(3);
    expect(state.xp).toBe(300 - xpForLevel(1) - xpForLevel(2));
    expect(state.gems).toBe(EARN.gemsPerLevel * 2);
  });

  it('gates content on level (§8 / §13)', () => {
    const { state, progression } = setup(1);
    expect(progression.isUnlocked('monetisation')).toBe(false);
    expect(progression.isUnlocked('secondMiniGame')).toBe(false);

    state.setProgress(UNLOCK_LEVEL.monetisation, 0);
    expect(progression.isUnlocked('monetisation')).toBe(true);
    expect(progression.isUnlocked('secondMiniGame')).toBe(false);

    state.setProgress(UNLOCK_LEVEL.bedroomDecor, 0);
    expect(progression.isUnlocked('secondMiniGame')).toBe(true);
    expect(progression.isUnlocked('bedroomDecor')).toBe(true);
  });
});

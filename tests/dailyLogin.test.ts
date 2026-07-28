import { describe, expect, it } from 'vitest';

import { DailyLogin, isConsecutive, rewardForStreak } from '@/core/DailyLogin';
import { EARN } from '@/config/tuning';
import { Clock } from '@/core/Clock';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';

function setup(startAt = new Date(2026, 4, 12, 9, 0).getTime()) {
  let wall = startAt;
  let mono = 0;
  const time = new Clock({ wallNow: () => wall, monotonicNow: () => mono });

  const save = createDefaultSave(startAt);
  save.coins = 0;
  const state = new GameState(save);
  const economy = new Economy(state);

  return {
    state,
    login: new DailyLogin(state, economy, time),
    advanceDays(days: number) {
      wall += days * 24 * 60 * 60 * 1000;
      mono += days * 24 * 60 * 60 * 1000;
    },
  };
}

describe('rewardForStreak (§7)', () => {
  it('escalates from 50 to 300 across seven days', () => {
    expect(rewardForStreak(1)).toBe(50);
    expect(rewardForStreak(7)).toBe(300);
    for (let day = 2; day <= 7; day++) {
      expect(rewardForStreak(day)).toBeGreaterThan(rewardForStreak(day - 1));
    }
  });

  it('holds at the day-7 value rather than looping back', () => {
    expect(rewardForStreak(8)).toBe(300);
    expect(rewardForStreak(400)).toBe(300);
  });

  it('clamps nonsense input to day 1', () => {
    expect(rewardForStreak(0)).toBe(EARN.dailyLoginCoins[0]);
    expect(rewardForStreak(-5)).toBe(EARN.dailyLoginCoins[0]);
  });
});

describe('isConsecutive', () => {
  it('accepts the next calendar day', () => {
    expect(isConsecutive('2026-05-12', '2026-05-13')).toBe(true);
    expect(isConsecutive('2026-05-31', '2026-06-01')).toBe(true);
    expect(isConsecutive('2026-12-31', '2027-01-01')).toBe(true);
  });

  it('rejects the same day, a gap, and going backwards', () => {
    expect(isConsecutive('2026-05-12', '2026-05-12')).toBe(false);
    expect(isConsecutive('2026-05-12', '2026-05-14')).toBe(false);
    expect(isConsecutive('2026-05-13', '2026-05-12')).toBe(false);
  });

  it('treats a missing previous key as a fresh start', () => {
    expect(isConsecutive('', '2026-05-12')).toBe(false);
    expect(isConsecutive('nonsense', '2026-05-12')).toBe(false);
  });
});

describe('DailyLogin', () => {
  it('pays day 1 on a first run', () => {
    const { state, login } = setup();
    const result = login.claim();
    expect(result).toEqual({ claimed: true, streak: 1, coins: 50 });
    expect(state.coins).toBe(50);
  });

  it('pays once a day, however many times it is called', () => {
    const { state, login } = setup();
    login.claim();
    expect(login.claim()).toEqual({ claimed: false, streak: 1, coins: 0 });
    expect(login.claim().claimed).toBe(false);
    expect(state.coins).toBe(50);
  });

  it('builds a streak across consecutive days', () => {
    const { state, login, advanceDays } = setup();
    let total = 0;
    for (let day = 1; day <= 7; day++) {
      const result = login.claim();
      expect(result.streak).toBe(day);
      total += result.coins;
      advanceDays(1);
    }
    expect(state.coins).toBe(total);
    expect(total).toBe(EARN.dailyLoginCoins.reduce((a, b) => a + b, 0));
  });

  it('resets the streak after a missed day', () => {
    const { login, advanceDays } = setup();
    login.claim();
    advanceDays(1);
    expect(login.claim().streak).toBe(2);
    advanceDays(3);
    expect(login.claim()).toEqual({ claimed: true, streak: 1, coins: 50 });
  });
});

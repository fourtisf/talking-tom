/**
 * Daily login reward. Spec §7 — 50 coins escalating to 300 on day 7, once a day.
 *
 * The streak advances only on consecutive device-local days; any gap resets it
 * to day 1. Past day 7 the reward stays at the day-7 value rather than looping,
 * so a long streak is never worth less than a short one.
 */

import { EARN } from '@/config/tuning';
import type { Clock } from '@/core/Clock';
import type { Economy } from '@/core/Economy';
import type { GameState } from '@/core/GameState';
import { analytics } from '@/services/Analytics';

export interface DailyLoginResult {
  claimed: boolean;
  streak: number;
  coins: number;
}

/** Reward for a 1-based streak day. */
export function rewardForStreak(streak: number): number {
  const table = EARN.dailyLoginCoins;
  const index = Math.min(Math.max(1, Math.floor(streak)), table.length) - 1;
  return table[index] ?? table[0] ?? 0;
}

/** 'YYYY-MM-DD' -> ms epoch at local midnight, for adjacency comparison. */
function dayKeyToMs(key: string): number | null {
  const parts = key.split('-').map((p) => Number.parseInt(p, 10));
  const [y, m, d] = parts;
  if (y === undefined || m === undefined || d === undefined) return null;
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d).getTime();
}

/** True when `todayKey` is exactly the day after `previousKey`. */
export function isConsecutive(previousKey: string, todayKey: string): boolean {
  const previous = dayKeyToMs(previousKey);
  const today = dayKeyToMs(todayKey);
  if (previous === null || today === null) return false;
  const oneDay = 24 * 60 * 60 * 1000;
  // Compare with a tolerance so a DST shift does not break a streak.
  const gap = today - previous;
  return gap > oneDay * 0.5 && gap < oneDay * 1.5;
}

export class DailyLogin {
  private readonly state: GameState;
  private readonly economy: Economy;
  private readonly time: Clock;

  constructor(state: GameState, economy: Economy, time: Clock) {
    this.state = state;
    this.economy = economy;
    this.time = time;
  }

  /** Claim today's reward if it has not been claimed. Safe to call repeatedly. */
  claim(): DailyLoginResult {
    const todayKey = this.time.localDayKey();
    const lastKey = this.state.dailyLoginDayKey;

    if (lastKey === todayKey) {
      return { claimed: false, streak: this.state.dailyLoginStreak, coins: 0 };
    }

    const streak = isConsecutive(lastKey, todayKey) ? this.state.dailyLoginStreak + 1 : 1;
    const coins = rewardForStreak(streak);

    this.state.setDailyLogin(todayKey, streak);
    this.economy.earn(coins, 'daily-login');
    analytics.track('daily_login', { streak, coins });

    return { claimed: true, streak, coins };
  }
}

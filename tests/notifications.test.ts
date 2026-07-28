import { describe, expect, it } from 'vitest';

import {
  isQuietHour,
  msUntilThreshold,
  planNotifications,
  shiftOutOfQuietHours,
} from '@/services/Notifications';
import { MS_PER_HOUR, NOTIFICATIONS, SLEEP, STAT_DECAY_PER_HOUR, STAT_NOTIFY_BELOW } from '@/config/tuning';
import type { PetStats } from '@/core/types';

/** Local-time helpers matching what `Notifications` passes in at runtime. */
const hourOf = (ms: number): number => new Date(ms).getHours();
const startOfHour = (ms: number, hour: number): number => {
  const d = new Date(ms);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

/** Midday local, so the quiet window is far away unless a test moves into it. */
const NOON = new Date(2026, 4, 12, 12, 0, 0).getTime();

const FULL: PetStats = { hunger: 100, energy: 100, fun: 100, clean: 100 };

describe('msUntilThreshold (§14)', () => {
  it('predicts the crossing time from the decay rate', () => {
    const ms = msUntilThreshold('hunger', FULL, false);
    const expectedHours = (100 - STAT_NOTIFY_BELOW.hunger) / STAT_DECAY_PER_HOUR.hunger;
    expect(ms).toBeCloseTo(expectedHours * MS_PER_HOUR, 3);
  });

  it('returns null for a stat already under the threshold', () => {
    expect(msUntilThreshold('fun', { ...FULL, fun: STAT_NOTIFY_BELOW.fun }, false)).toBeNull();
    expect(msUntilThreshold('fun', { ...FULL, fun: 5 }, false)).toBeNull();
  });

  it('slows hunger and freezes fun and clean while asleep', () => {
    const awake = msUntilThreshold('hunger', FULL, false) ?? 0;
    const asleep = msUntilThreshold('hunger', FULL, true) ?? 0;
    expect(asleep).toBeCloseTo(awake / SLEEP.hungerDecayMultiplier, 3);

    expect(msUntilThreshold('fun', FULL, true)).toBeNull();
    expect(msUntilThreshold('clean', FULL, true)).toBeNull();
  });

  it('never predicts an energy warning while the pet is charging', () => {
    expect(msUntilThreshold('energy', { ...FULL, energy: 40 }, true)).toBeNull();
    expect(msUntilThreshold('energy', { ...FULL, energy: 40 }, false)).not.toBeNull();
  });
});

describe('quiet hours (§14)', () => {
  it('covers 22:00 through 07:59 device-local', () => {
    const at = (h: number): number => new Date(2026, 4, 12, h, 30).getTime();
    expect(isQuietHour(at(22), hourOf)).toBe(true);
    expect(isQuietHour(at(23), hourOf)).toBe(true);
    expect(isQuietHour(at(0), hourOf)).toBe(true);
    expect(isQuietHour(at(7), hourOf)).toBe(true);
    expect(isQuietHour(at(8), hourOf)).toBe(false);
    expect(isQuietHour(at(12), hourOf)).toBe(false);
    expect(isQuietHour(at(21), hourOf)).toBe(false);
  });

  it('pushes an early-morning crossing to 08:00 the same day', () => {
    const at3am = new Date(2026, 4, 12, 3, 14).getTime();
    const shifted = shiftOutOfQuietHours(at3am, hourOf, startOfHour);
    const d = new Date(shifted);
    expect(d.getHours()).toBe(NOTIFICATIONS.quietEndHour);
    expect(d.getDate()).toBe(12);
  });

  it('pushes a late-night crossing to 08:00 the next day', () => {
    const at23 = new Date(2026, 4, 12, 23, 40).getTime();
    const shifted = shiftOutOfQuietHours(at23, hourOf, startOfHour);
    const d = new Date(shifted);
    expect(d.getHours()).toBe(NOTIFICATIONS.quietEndHour);
    expect(d.getDate()).toBe(13);
  });

  it('leaves a daytime crossing alone', () => {
    const at14 = new Date(2026, 4, 12, 14, 5).getTime();
    expect(shiftOutOfQuietHours(at14, hourOf, startOfHour)).toBe(at14);
  });
});

describe('planNotifications (§14)', () => {
  const base = { nowMs: NOON, hourOf, startOfHour, isSleeping: false, alreadyToday: 0 };

  it('never schedules more than two a day', () => {
    const planned = planNotifications({ ...base, stats: FULL });
    expect(planned.length).toBeLessThanOrEqual(NOTIFICATIONS.maxPerDay);
    expect(planned).toHaveLength(2);
  });

  it('respects notifications already sent today', () => {
    expect(planNotifications({ ...base, stats: FULL, alreadyToday: 1 })).toHaveLength(1);
    expect(planNotifications({ ...base, stats: FULL, alreadyToday: 2 })).toHaveLength(0);
    expect(planNotifications({ ...base, stats: FULL, alreadyToday: 9 })).toHaveLength(0);
  });

  it('picks the soonest crossings first', () => {
    const planned = planNotifications({ ...base, stats: FULL });
    // Fun decays fastest, so it crosses first from a full start.
    expect(planned[0]?.stat).toBe('fun');
    expect(planned[0]?.at).toBeLessThanOrEqual(planned[1]?.at ?? Infinity);
  });

  it('schedules nothing when every stat is already below its threshold', () => {
    const flat: PetStats = { hunger: 5, energy: 5, fun: 5, clean: 5 };
    expect(planNotifications({ ...base, stats: flat })).toHaveLength(0);
  });

  it('is quiet about a sleeping pet whose stats are frozen', () => {
    const planned = planNotifications({ ...base, stats: FULL, isSleeping: true });
    // Only hunger still moves while asleep.
    expect(planned.map((p) => p.stat)).toEqual(['hunger']);
  });

  it('speaks as the pet, not as the app', () => {
    const planned = planNotifications({ ...base, stats: FULL });
    for (const item of planned) {
      expect(item.title).toMatch(/Biskit/);
      expect(item.title).not.toMatch(/come back/i);
      expect(item.title.length).toBeLessThan(46);
    }
  });

  it('gives each stat a stable id so a reschedule replaces rather than stacks', () => {
    const a = planNotifications({ ...base, stats: FULL });
    const b = planNotifications({ ...base, stats: FULL });
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
    expect(new Set(a.map((n) => n.id)).size).toBe(a.length);
  });
});

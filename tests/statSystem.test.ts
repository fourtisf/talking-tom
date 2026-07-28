import { describe, expect, it } from 'vitest';

import {
  decayAsleep,
  decayAwake,
  hoursUntilRested,
  resolveElapsed,
  shouldShowReturnCard,
  simulateOffline,
  StatSystem,
} from '@/core/StatSystem';
import { MS_PER_HOUR, OFFLINE, SLEEP, STAT_DECAY_PER_HOUR, STAT_MIN } from '@/config/tuning';
import { GameState, createDefaultSave } from '@/core/GameState';
import { Clock } from '@/core/Clock';
import { STAT_KEYS, type PetStats } from '@/core/types';

const FULL: PetStats = { hunger: 100, energy: 100, fun: 100, clean: 100 };
const MID: PetStats = { hunger: 62, energy: 74, fun: 48, clean: 70 };

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const hours = (n: number) => T0 + n * MS_PER_HOUR;

function offlineAt(elapsedHours: number, opts: { stats?: PetStats; isSleeping?: boolean } = {}) {
  return simulateOffline({
    stats: opts.stats ?? MID,
    isSleeping: opts.isSleeping ?? false,
    lastSeenUtc: T0,
    nowMs: hours(elapsedHours),
  });
}

/* ------------------------------------------------------------------ *
 * §5 — decay rates and floors
 * ------------------------------------------------------------------ */

describe('decay rates (§5)', () => {
  it('drains each stat from full to empty over its stated window', () => {
    // Full -> empty: hunger 8h, energy 10h, fun 6h, clean 14h.
    expect(decayAwake(FULL, 8).hunger).toBe(STAT_MIN);
    expect(decayAwake(FULL, 10).energy).toBe(STAT_MIN);
    expect(decayAwake(FULL, 6).fun).toBe(STAT_MIN);
    expect(decayAwake(FULL, 14).clean).toBe(STAT_MIN);

    // One hour short, each is still above the floor.
    expect(decayAwake(FULL, 7).hunger).toBeGreaterThan(STAT_MIN);
    expect(decayAwake(FULL, 9).energy).toBeGreaterThan(STAT_MIN);
    expect(decayAwake(FULL, 5).fun).toBeGreaterThan(STAT_MIN);
    expect(decayAwake(FULL, 13).clean).toBeGreaterThan(STAT_MIN);
  });

  it('applies the exact per-hour rate', () => {
    const after = decayAwake(FULL, 1);
    for (const key of STAT_KEYS) {
      expect(after[key]).toBeCloseTo(100 - STAT_DECAY_PER_HOUR[key], 6);
    }
  });

  it('is continuous: one 3h step equals three 1h steps', () => {
    const once = decayAwake(MID, 3);
    let stepped = MID;
    for (let i = 0; i < 3; i++) stepped = decayAwake(stepped, 1);
    for (const key of STAT_KEYS) {
      expect(once[key]).toBeCloseTo(stepped[key], 6);
    }
  });

  it('never lets a stat read 0 or above 100 (§15)', () => {
    const starved = decayAwake(FULL, 1000);
    const stuffed = decayAsleep({ ...FULL, energy: 99 }, 1000);
    for (const key of STAT_KEYS) {
      expect(starved[key]).toBeGreaterThanOrEqual(STAT_MIN);
      expect(starved[key]).toBeLessThanOrEqual(100);
      expect(stuffed[key]).toBeGreaterThanOrEqual(STAT_MIN);
      expect(stuffed[key]).toBeLessThanOrEqual(100);
    }
    expect(starved.hunger).toBe(STAT_MIN);
  });

  it('does nothing for zero or negative hours', () => {
    expect(decayAwake(MID, 0)).toEqual(MID);
    expect(decayAwake(MID, -5)).toEqual(MID);
    expect(decayAsleep(MID, 0)).toEqual(MID);
  });
});

describe('sleep (§5)', () => {
  it('refills energy 0 -> 100 in four hours', () => {
    const drained: PetStats = { ...MID, energy: 0 };
    expect(decayAsleep(drained, 4).energy).toBe(100);
    expect(decayAsleep(drained, 2).energy).toBeCloseTo(2 * SLEEP.energyRegenPerHour, 6);
  });

  it('slows hunger to 40% and freezes fun and clean', () => {
    const after = decayAsleep(MID, 2);
    expect(after.hunger).toBeCloseTo(MID.hunger - STAT_DECAY_PER_HOUR.hunger * 0.4 * 2, 6);
    expect(after.fun).toBe(MID.fun);
    expect(after.clean).toBe(MID.clean);
  });

  it('reports the hours left until auto-wake', () => {
    expect(hoursUntilRested(100)).toBe(0);
    expect(hoursUntilRested(120)).toBe(0);
    expect(hoursUntilRested(0)).toBeCloseTo(4, 6);
    expect(hoursUntilRested(50)).toBeCloseTo(2, 6);
  });
});

/* ------------------------------------------------------------------ *
 * §6 — the seven required offline cases
 * ------------------------------------------------------------------ */

describe('offline catch-up (§6)', () => {
  it('0h — nothing changes', () => {
    const report = offlineAt(0);
    expect(report.appliedHours).toBe(0);
    expect(report.after).toEqual(MID);
    expect(report.capped).toBe(false);
    expect(shouldShowReturnCard(report)).toBe(false);
  });

  it('1h — exactly one hour of decay, still no return card', () => {
    const report = offlineAt(1);
    expect(report.appliedHours).toBeCloseTo(1, 9);
    expect(report.after.hunger).toBeCloseTo(MID.hunger - STAT_DECAY_PER_HOUR.hunger, 6);
    expect(report.deltas.fun).toBeCloseTo(-STAT_DECAY_PER_HOUR.fun, 6);
    // The card needs *more* than an hour.
    expect(shouldShowReturnCard(report)).toBe(false);
    expect(shouldShowReturnCard(offlineAt(1.5))).toBe(true);
  });

  it('8h — eight hours of decay, uncapped', () => {
    const report = offlineAt(8);
    expect(report.capped).toBe(false);
    expect(report.appliedHours).toBeCloseTo(8, 9);
    expect(report.after.hunger).toBe(STAT_MIN); // 62 - 8*12.5 = -38 -> floor
    expect(report.after.energy).toBe(STAT_MIN); // 74 - 8*10  = -6  -> floor
    expect(report.after.clean).toBeCloseTo(70 - STAT_DECAY_PER_HOUR.clean * 8, 6);
    expect(shouldShowReturnCard(report)).toBe(true);
  });

  it('18h — the cap itself is applied in full, not clipped', () => {
    const report = offlineAt(OFFLINE.capHours);
    expect(report.capped).toBe(false);
    expect(report.appliedHours).toBeCloseTo(OFFLINE.capHours, 9);
    expect(report.after.clean).toBeCloseTo(
      Math.max(STAT_MIN, 70 - STAT_DECAY_PER_HOUR.clean * OFFLINE.capHours),
      6,
    );
  });

  it('40h — capped at 18h, identical to an 18h absence', () => {
    const long = offlineAt(40);
    const atCap = offlineAt(OFFLINE.capHours);
    expect(long.capped).toBe(true);
    expect(long.appliedHours).toBe(OFFLINE.capHours);
    expect(long.elapsedHours).toBeCloseTo(40, 9);
    expect(long.after).toEqual(atCap.after);
    expect(long.suspiciousJump).toBe(false);
  });

  it('negative — a backwards clock applies zero decay and is flagged', () => {
    const report = simulateOffline({
      stats: MID,
      isSleeping: false,
      lastSeenUtc: T0,
      nowMs: hours(-6),
    });
    expect(report.clockWentBackwards).toBe(true);
    expect(report.appliedHours).toBe(0);
    expect(report.after).toEqual(MID);
    // Never a reward, never a punishment, and never a return card.
    expect(report.deltas).toEqual({ hunger: 0, energy: 0, fun: 0, clean: 0 });
    expect(shouldShowReturnCard(report)).toBe(false);
  });

  it('60 days — flagged as manipulation and still only 18h of decay', () => {
    const report = offlineAt(24 * 60);
    expect(report.suspiciousJump).toBe(true);
    expect(report.capped).toBe(true);
    expect(report.appliedHours).toBe(OFFLINE.capHours);
    expect(report.after).toEqual(offlineAt(OFFLINE.capHours).after);
  });
});

describe('offline catch-up while asleep (§6)', () => {
  it('regenerates energy and wakes at 100', () => {
    const report = offlineAt(4, { stats: { ...MID, energy: 0 }, isSleeping: true });
    expect(report.wokeUp).toBe(true);
    expect(report.after.energy).toBe(100);
  });

  it('stays asleep when the window is shorter than the rest needed', () => {
    const report = offlineAt(1, { stats: { ...MID, energy: 0 }, isSleeping: true });
    expect(report.wokeUp).toBe(false);
    expect(report.after.energy).toBeCloseTo(SLEEP.energyRegenPerHour, 6);
    expect(report.after.fun).toBe(MID.fun); // frozen while asleep
  });

  it('wakes partway through and decays normally afterwards', () => {
    // Energy 50 -> full after 2h, then 2 waking hours. Stats start high enough
    // that nothing hits the floor, so the split is what is actually measured.
    const rested: PetStats = { hunger: 90, energy: 50, fun: 90, clean: 90 };
    const report = offlineAt(4, { stats: rested, isSleeping: true });

    expect(report.wokeUp).toBe(true);
    // 2h asleep filled energy to 100, then 2 waking hours took it back down.
    expect(report.after.energy).toBeCloseTo(100 - STAT_DECAY_PER_HOUR.energy * 2, 6);
    // Fun froze for the 2 sleeping hours, then decayed for 2.
    expect(report.after.fun).toBeCloseTo(90 - STAT_DECAY_PER_HOUR.fun * 2, 6);
    // Hunger crawled at 40% for 2h, then ran at full rate for 2h.
    expect(report.after.hunger).toBeCloseTo(
      90 - STAT_DECAY_PER_HOUR.hunger * 0.4 * 2 - STAT_DECAY_PER_HOUR.hunger * 2,
      6,
    );
  });
});

describe('resolveElapsed', () => {
  it('classifies each window', () => {
    expect(resolveElapsed(T0, T0)).toMatchObject({ appliedHours: 0, capped: false });
    expect(resolveElapsed(T0, hours(2))).toMatchObject({ capped: false, suspiciousJump: false });
    expect(resolveElapsed(T0, hours(19))).toMatchObject({ capped: true, appliedHours: 18 });
    expect(resolveElapsed(T0, hours(-1))).toMatchObject({ clockWentBackwards: true, appliedHours: 0 });
    expect(resolveElapsed(T0, hours(24 * 31))).toMatchObject({ suspiciousJump: true, appliedHours: 18 });
  });

  it('treats a non-finite gap as a backwards clock rather than crashing', () => {
    expect(resolveElapsed(Number.NaN, T0).clockWentBackwards).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Runtime wiring
 * ------------------------------------------------------------------ */

describe('StatSystem wiring', () => {
  function makeSystem(elapsedHours: number, isSleeping = false) {
    const save = createDefaultSave(T0);
    save.stats = { ...MID };
    save.isSleeping = isSleeping;
    save.sleepStartedUtc = isSleeping ? T0 : null;
    save.lastSeenUtc = T0;

    let wall = hours(elapsedHours);
    let mono = 0;
    const time = new Clock({ wallNow: () => wall, monotonicNow: () => mono });
    const state = new GameState(save);
    const system = new StatSystem(state, time);
    return {
      state,
      system,
      advance(ms: number) {
        wall += ms;
        mono += ms;
      },
    };
  }

  it('writes the caught-up stats back and stamps lastSeenUtc', () => {
    const { state, system } = makeSystem(8);
    const report = system.catchUp();
    expect(state.stats.hunger).toBe(STAT_MIN);
    expect(state.lastSeenUtc).toBe(hours(8));
    expect(report.appliedHours).toBeCloseTo(8, 9);
  });

  it('clears the sleeping flag when the pet woke up while away', () => {
    const { state, system } = makeSystem(6, true);
    state.setStat('energy', 0);
    system.catchUp();
    expect(state.isSleeping).toBe(false);
    expect(state.stats.energy).toBeLessThan(100); // rested, then decayed
  });

  it('a backwards clock resets the stamp without touching stats', () => {
    const { state, system } = makeSystem(-3);
    const report = system.catchUp();
    expect(report.clockWentBackwards).toBe(true);
    expect(state.stats).toEqual(MID);
    // The stamp still moves forward to the Clock's guarded now(), so the next
    // catch-up cannot re-apply the same window.
    expect(state.lastSeenUtc).toBeGreaterThanOrEqual(hours(-3));
  });

  it('ticks fractionally without losing time to rounding', () => {
    const { state, system, advance } = makeSystem(0);
    const startHunger = state.stats.hunger;
    // 3600 frames of 1s = one hour.
    for (let i = 0; i < 3600; i++) {
      advance(1000);
      system.tick(1000);
    }
    expect(state.stats.hunger).toBeCloseTo(startHunger - STAT_DECAY_PER_HOUR.hunger, 4);
    expect(state.totalPlaySeconds).toBe(3600);
  });

  it('accumulates sub-second frames instead of dropping them', () => {
    const { state, system, advance } = makeSystem(0);
    const startFun = state.stats.fun;

    // 60 frames of 16ms = 960ms — still under a second, nothing banked yet.
    for (let i = 0; i < 60; i++) {
      advance(16);
      system.tick(16);
    }
    expect(state.totalPlaySeconds).toBe(0);
    expect(state.stats.fun).toBe(startFun);

    // Three more frames cross the second boundary; the earlier 960ms was kept.
    for (let i = 0; i < 3; i++) {
      advance(16);
      system.tick(16);
    }
    expect(state.totalPlaySeconds).toBe(1);
    expect(state.stats.fun).toBeCloseTo(startFun - STAT_DECAY_PER_HOUR.fun / 3600, 6);
  });

  it('auto-wakes on the tick that fills energy', () => {
    const { state, system, advance } = makeSystem(0, true);
    state.setStat('energy', 99.9);
    advance(60_000);
    system.tick(60_000);
    expect(state.isSleeping).toBe(false);
    expect(state.stats.energy).toBe(100);
  });
});

/**
 * The toilet need.
 *
 * Three things are defended here, and they pull against each other.
 *
 * It has to be a REAL need — it decays, it survives the away window, and
 * ignoring it has a consequence — or it is a button that does nothing.
 *
 * It must never punish someone who was not warned. An accident booked while
 * the player was away, on a cat who was comfortable when they left, is a tax
 * rather than a consequence, and a consequence the player never saw arrive is
 * indistinguishable from a bug.
 *
 * And it must not leak into the four stats. `STAT_KEYS` drives "get every
 * meter above 80", the mood resolver's lowest-stat rule and the return card's
 * delta list; a fifth key would silently change all three. That it is NOT in
 * there is a design decision, so it gets a test rather than a comment.
 */

import { describe, expect, it } from 'vitest';

import { RELIEF, STAT_DECAY_PER_HOUR, STARTING, TASKS, XP_AWARDS } from '@/config/tuning';
import { clampRelief, createDefaultSave } from '@/core/GameState';
import {
  decayAwake,
  decayRelief,
  reliefState,
  simulateOffline,
} from '@/core/StatSystem';
import { validate } from '@/core/SaveManager';
import { msUntilRelief, planNotifications } from '@/services/Notifications';
import { STAT_KEYS, type PetStats } from '@/core/types';

const FULL: PetStats = { hunger: 100, energy: 100, fun: 100, clean: 100 };
const HOUR = 3_600_000;

describe('the need itself', () => {
  it('empties in about nine hours awake', () => {
    expect(decayRelief(RELIEF.max, 9, false)).toBeLessThanOrEqual(1);
    expect(decayRelief(RELIEF.max, 8, false)).toBeGreaterThan(0);
  });

  /**
   * The first time going to bed is a STRATEGY rather than a way to refill one
   * meter: tucking her in before you leave genuinely holds it.
   */
  it('barely moves while she is asleep', () => {
    const awake = RELIEF.max - decayRelief(RELIEF.max, 6, false);
    const asleep = RELIEF.max - decayRelief(RELIEF.max, 6, true);
    expect(asleep).toBeLessThan(awake / 2);
    expect(decayRelief(RELIEF.max, 8, true)).toBeGreaterThan(RELIEF.warnBelow);
  });

  it('floors at 0, not at STAT_MIN — 0 is when the clock starts', () => {
    expect(decayRelief(10, 5, false)).toBe(RELIEF.min);
    expect(clampRelief(-40)).toBe(0);
    expect(clampRelief(400)).toBe(RELIEF.max);
  });

  it('asks before it is desperate', () => {
    expect(reliefState(RELIEF.max)).toBe('fine');
    expect(reliefState(RELIEF.warnBelow - 1)).toBe('asking');
    expect(reliefState(RELIEF.min)).toBe('desperate');
    expect(RELIEF.notifyBelow).toBeLessThan(RELIEF.warnBelow);
  });

  it('is slower than the stat that is meant to pull players back', () => {
    // Fun is fastest on purpose. This one's ask is interruptive rather than
    // inviting, so it must never be the thing shouting loudest.
    expect(RELIEF.decayPerHour).toBeLessThan(STAT_DECAY_PER_HOUR.fun);
    expect(RELIEF.decayPerHour).toBeLessThan(STAT_DECAY_PER_HOUR.hunger);
  });
});

describe('it stays out of the four stats', () => {
  it('is not a fifth meter', () => {
    expect(STAT_KEYS).not.toContain('relief');
    expect(STAT_KEYS).toHaveLength(4);
  });

  it('leaves the offline deltas a four-key object', () => {
    const report = simulateOffline({
      stats: FULL,
      isSleeping: false,
      lastSeenUtc: 0,
      nowMs: 3 * HOUR,
      relief: 50,
    });
    expect(Object.keys(report.deltas).sort()).toEqual(['clean', 'energy', 'fun', 'hunger']);
  });

  it('reports itself as a before/after, not as a delta to display', () => {
    const report = simulateOffline({
      stats: FULL,
      isSleeping: false,
      lastSeenUtc: 0,
      nowMs: 3 * HOUR,
      relief: 90,
    });
    expect(report.reliefBefore).toBe(90);
    expect(report.reliefAfter).toBeLessThan(90);
    expect(report.accident).toBe(false);
  });
});

describe('the away window', () => {
  /**
   * THE RULE THAT MAKES THIS SAFE TO SHIP. Leaving a comfortable cat for
   * eighteen hours must not return a puddle: she never asked, so there was
   * nothing to ignore.
   */
  it('never books an accident for a cat who had not asked yet', () => {
    const report = simulateOffline({
      stats: FULL,
      isSleeping: false,
      lastSeenUtc: 0,
      nowMs: 18 * HOUR,
      relief: RELIEF.max,
    });
    // Eighteen hours empties her — she comes back desperate, not disgraced.
    expect(report.reliefAfter).toBe(RELIEF.min);
    expect(report.accident).toBe(false);
  });

  it('books one for a cat who was already asking when you left', () => {
    const report = simulateOffline({
      stats: FULL,
      isSleeping: false,
      lastSeenUtc: 0,
      nowMs: 6 * HOUR,
      relief: RELIEF.warnBelow - 1,
    });
    expect(report.accident).toBe(true);
    // And she did go, so she comes back comfortable.
    expect(report.reliefAfter).toBe(RELIEF.max);
    expect(report.after.clean).toBeCloseTo(
      FULL.clean - STAT_DECAY_PER_HOUR.clean * 6 - RELIEF.accidentCleanPenalty,
      5,
    );
  });

  it('never wets the bed', () => {
    const report = simulateOffline({
      // Energy low enough that she stays asleep the whole window.
      stats: { ...FULL, energy: 5 },
      isSleeping: true,
      lastSeenUtc: 0,
      nowMs: 3 * HOUR,
      relief: 2,
    });
    expect(report.wokeUp).toBe(false);
    expect(report.accident).toBe(false);
  });

  /**
   * Six hours at a nine-hour bladder is one emptying; eighteen is two, and
   * forty is four. Charging four is the kind of unbounded punishment
   * `OFFLINE.capHours` already exists to prevent, so the flag is a boolean and
   * the clean hit lands exactly once.
   */
  it('charges the clean hit exactly once', () => {
    const at = (relief: number) =>
      simulateOffline({
        stats: FULL,
        isSleeping: false,
        lastSeenUtc: 0,
        nowMs: 6 * HOUR,
        relief,
      });
    const went = at(5);
    const held = at(RELIEF.max);
    expect(went.accident).toBe(true);
    expect(held.accident).toBe(false);
    expect(held.after.clean - went.after.clean).toBeCloseTo(RELIEF.accidentCleanPenalty, 5);
  });

  it('still charges only one after a two-day absence', () => {
    const long = simulateOffline({
      stats: FULL,
      isSleeping: false,
      lastSeenUtc: 0,
      nowMs: 40 * HOUR,
      relief: 5,
    });
    expect(long.accident).toBe(true);
    expect(long.reliefAfter).toBe(RELIEF.max);
    // Capped and floored by machinery that already existed.
    expect(long.appliedHours).toBe(18);
    expect(long.after.clean).toBe(5);
  });

  it('applies nothing at all when the clock went backwards', () => {
    const report = simulateOffline({
      stats: FULL,
      isSleeping: false,
      lastSeenUtc: 10 * HOUR,
      nowMs: 0,
      relief: 4,
    });
    expect(report.accident).toBe(false);
    expect(report.reliefAfter).toBe(4);
  });
});

describe('a mess makes things worse, but only so far', () => {
  it('speeds up cleanliness and nothing else', () => {
    const tidy = decayAwake(FULL, 5);
    const messy = decayAwake(FULL, 5, { messy: true });
    expect(messy.clean).toBeLessThan(tidy.clean);
    expect(messy.hunger).toBe(tidy.hunger);
    expect(messy.fun).toBe(tidy.fun);
    expect(messy.energy).toBe(tidy.energy);
  });

  it('speeds it up by exactly the configured multiple', () => {
    const lost = FULL.clean - decayAwake(FULL, 4, { messy: true }).clean;
    expect(lost).toBeCloseTo(STAT_DECAY_PER_HOUR.clean * RELIEF.messCleanMultiplier * 4, 5);
  });

  /**
   * The bound that makes an accumulating penalty safe: the offline cap and the
   * stat floor already exist, so the worst case with a mess is identical to
   * the worst case without one.
   */
  it('cannot make the worst case any worse than it already was', () => {
    const messy = simulateOffline({
      stats: { hunger: 20, energy: 20, fun: 20, clean: 20 },
      isSleeping: false,
      lastSeenUtc: 0,
      nowMs: 18 * HOUR,
      relief: RELIEF.max,
      messy: true,
    });
    const tidy = simulateOffline({
      stats: { hunger: 20, energy: 20, fun: 20, clean: 20 },
      isSleeping: false,
      lastSeenUtc: 0,
      nowMs: 18 * HOUR,
      relief: RELIEF.max,
    });
    expect(messy.after.clean).toBe(tidy.after.clean);
  });
});

describe('old saves', () => {
  /**
   * The whole feature is migration-free because of this one default. A pet who
   * has never had this need cannot be behind on it, and the warn-gate above
   * means the first session after an update can only ever start with a
   * comfortable cat.
   */
  it('load comfortable, not desperate', () => {
    const old = validate({ version: 1, level: 6, coins: 40 }, 1000);
    expect(old.relief).toBe(RELIEF.max);
    expect(old.messRoom).toBeNull();
  });

  it('a new pet starts where the stats do — comfortable, not brand new', () => {
    expect(createDefaultSave(1000).relief).toBe(STARTING.relief);
    expect(STARTING.relief).toBeLessThan(RELIEF.max);
  });

  it('keep a mess across a reload, and refuse a room she cannot stand in', () => {
    expect(validate({ messRoom: 'bed' }, 1000).messRoom).toBe('bed');
    expect(validate({ messRoom: 'play' }, 1000).messRoom).toBeNull();
    expect(validate({ messRoom: 'attic' }, 1000).messRoom).toBeNull();
  });

  it('survive a hand-edited relief', () => {
    expect(validate({ relief: 9999 }, 1000).relief).toBe(RELIEF.max);
    expect(validate({ relief: -50 }, 1000).relief).toBe(RELIEF.min);
    expect(validate({ relief: 'lots' }, 1000).relief).toBe(RELIEF.max);
  });
});

describe('she can say so while the app is shut', () => {
  // Every stat already past its own threshold, so the four of them are not
  // candidates and this test is about the fifth thing rather than about which
  // of five wins a two-slot race.
  const base = {
    stats: { hunger: 10, energy: 10, fun: 10, clean: 10 },
    isSleeping: false,
    nowMs: 12 * HOUR,
    hourOf: (ms: number) => Math.floor(ms / HOUR) % 24,
    startOfHour: (ms: number, hour: number) => Math.floor(ms / (24 * HOUR)) * 24 * HOUR + hour * HOUR,
    alreadyToday: 0,
  };

  it('schedules one when the need is heading for the threshold', () => {
    const planned = planNotifications({ ...base, relief: RELIEF.max });
    expect(planned.some((p) => p.stat === 'relief')).toBe(true);
  });

  it('says nothing about a need that is already past it', () => {
    expect(msUntilRelief(RELIEF.notifyBelow - 1, false)).toBeNull();
  });

  it('says nothing at all for a caller that predates the need', () => {
    expect(msUntilRelief(undefined, false)).toBeNull();
    const planned = planNotifications(base);
    expect(planned.some((p) => p.stat === 'relief')).toBe(false);
  });

  it('competes for the same two-a-day budget rather than adding a fifth buzz', () => {
    const planned = planNotifications({ ...base, relief: RELIEF.max });
    expect(planned.length).toBeLessThanOrEqual(2);
  });
});

describe('the player is told the need exists', () => {
  it('has a daily task that names it in words', () => {
    const task = TASKS.pool.find((t) => t.trigger === 'litter');
    expect(task).toBeDefined();
    expect(task?.room).toBe('home');
  });

  it('pays for the trip, and for clearing up after one that was missed', () => {
    expect(XP_AWARDS.litter).toBeGreaterThan(0);
    expect(XP_AWARDS.tidy).toBeGreaterThan(0);
    // Clearing up is a tap; a trip to the tray is the thing being encouraged.
    expect(XP_AWARDS.tidy).toBeLessThan(XP_AWARDS.litter);
  });
});

/**
 * Stat decay, clamping and offline catch-up. Spec §5 / §6.
 *
 * The maths lives in exported pure functions so the seven §6 cases can be
 * unit-tested without a canvas, a clock or a save file. The class on the bottom
 * is only the wiring that drives them from the game loop.
 */

import {
  MS_PER_HOUR,
  OFFLINE,
  SLEEP,
  STAT_DECAY_PER_HOUR,
  STAT_MAX,
  STAT_MIN,
} from '@/config/tuning';
import { clampStat, type GameState } from '@/core/GameState';
import { STAT_KEYS, type OfflineReport, type PetStats, type StatKey } from '@/core/types';
import { clock, type Clock } from '@/core/Clock';

/* ------------------------------------------------------------------ *
 * Pure maths
 * ------------------------------------------------------------------ */

export function cloneStats(stats: Readonly<PetStats>): PetStats {
  return { hunger: stats.hunger, energy: stats.energy, fun: stats.fun, clean: stats.clean };
}

/** Multiplier applied to a stat's normal decay rate while asleep. */
function sleepDecayMultiplier(key: StatKey): number {
  switch (key) {
    case 'hunger':
      return SLEEP.hungerDecayMultiplier;
    case 'fun':
      return SLEEP.funDecayMultiplier;
    case 'clean':
      return SLEEP.cleanDecayMultiplier;
    case 'energy':
      // Energy regenerates while asleep; handled separately, never decayed.
      return 0;
  }
}

/**
 * Advance stats by `hours` of *waking* time. Continuous, not ticked: calling
 * this once with 3h is identical to calling it three times with 1h.
 */
export function decayAwake(stats: Readonly<PetStats>, hours: number): PetStats {
  const out = cloneStats(stats);
  if (hours <= 0) return out;
  for (const key of STAT_KEYS) {
    out[key] = clampStat(out[key] - STAT_DECAY_PER_HOUR[key] * hours);
  }
  return out;
}

/** Advance stats by `hours` of *sleeping* time. Energy climbs, hunger crawls. */
export function decayAsleep(stats: Readonly<PetStats>, hours: number): PetStats {
  const out = cloneStats(stats);
  if (hours <= 0) return out;
  for (const key of STAT_KEYS) {
    if (key === 'energy') {
      out.energy = clampStat(out.energy + SLEEP.energyRegenPerHour * hours);
      continue;
    }
    out[key] = clampStat(out[key] - STAT_DECAY_PER_HOUR[key] * sleepDecayMultiplier(key) * hours);
  }
  return out;
}

/** Hours of sleep still needed to reach the auto-wake threshold. */
export function hoursUntilRested(energy: number): number {
  const missing = SLEEP.autoWakeAt - energy;
  if (missing <= 0) return 0;
  return missing / SLEEP.energyRegenPerHour;
}

export interface ElapsedResolution {
  elapsedHours: number;
  appliedHours: number;
  capped: boolean;
  clockWentBackwards: boolean;
  suspiciousJump: boolean;
}

/**
 * Turn a wall-clock gap into the number of hours the simulation should run.
 *
 * - negative       -> zero decay (device clock moved back; never punish)
 * - > 18h          -> 18h (retention decision)
 * - > 30 days      -> still 18h, additionally flagged as manipulation
 */
export function resolveElapsed(lastSeenUtc: number, nowMs: number): ElapsedResolution {
  const elapsedMs = nowMs - lastSeenUtc;

  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return {
      elapsedHours: elapsedMs / MS_PER_HOUR,
      appliedHours: 0,
      capped: false,
      clockWentBackwards: true,
      suspiciousJump: false,
    };
  }

  const elapsedHours = elapsedMs / MS_PER_HOUR;
  const suspiciousJump = elapsedHours > OFFLINE.clockManipulationThresholdHours;
  const appliedHours = Math.min(elapsedHours, OFFLINE.capHours);

  return {
    elapsedHours,
    appliedHours,
    capped: elapsedHours > OFFLINE.capHours,
    clockWentBackwards: false,
    suspiciousJump,
  };
}

export interface OfflineInput {
  stats: Readonly<PetStats>;
  isSleeping: boolean;
  lastSeenUtc: number;
  nowMs: number;
}

/**
 * Simulate the away period. Spec §6.
 *
 * If the pet was asleep and fills up partway through the window, it wakes at
 * that moment and the remainder of the window decays normally — a player who
 * leaves the pet asleep for 18h comes back to a rested pet that has since got
 * hungry, not to one frozen at the instant it woke.
 */
export function simulateOffline(input: OfflineInput): OfflineReport {
  const before = cloneStats(input.stats);
  const resolution = resolveElapsed(input.lastSeenUtc, input.nowMs);

  let stats = cloneStats(input.stats);
  let wokeUp = false;

  if (resolution.appliedHours > 0) {
    if (input.isSleeping) {
      const restHours = hoursUntilRested(stats.energy);
      if (restHours <= resolution.appliedHours) {
        stats = decayAsleep(stats, restHours);
        wokeUp = true;
        stats = decayAwake(stats, resolution.appliedHours - restHours);
      } else {
        stats = decayAsleep(stats, resolution.appliedHours);
      }
    } else {
      stats = decayAwake(stats, resolution.appliedHours);
    }
  }

  return {
    elapsedHours: resolution.elapsedHours,
    appliedHours: resolution.appliedHours,
    capped: resolution.capped,
    clockWentBackwards: resolution.clockWentBackwards,
    suspiciousJump: resolution.suspiciousJump,
    before,
    after: stats,
    deltas: {
      hunger: stats.hunger - before.hunger,
      energy: stats.energy - before.energy,
      fun: stats.fun - before.fun,
      clean: stats.clean - before.clean,
    },
    wokeUp,
  };
}

/** Whether the return card should be shown for this report. Spec §6. */
export function shouldShowReturnCard(report: OfflineReport): boolean {
  if (report.clockWentBackwards) return false;
  return report.elapsedHours > OFFLINE.returnCardMinHours;
}

/* ------------------------------------------------------------------ *
 * Runtime wiring
 * ------------------------------------------------------------------ */

export interface StatSystemEvents {
  offline: OfflineReport;
  autoWake: void;
}

/**
 * A gap larger than this between two ticks means the app was backgrounded or
 * the tab was throttled to a standstill; route it through the capped offline
 * path rather than applying it as one enormous foreground step.
 */
export const FOREGROUND_GAP_MS = 60_000;

export class StatSystem {
  private readonly state: GameState;
  private readonly time: Clock;

  /** Fractional stat carry, so a sub-second slice is not rounded away. */
  private accumulatorMs = 0;
  /** Wall-clock stamp of the previous tick. */
  private lastTickMs: number | null = null;

  constructor(state: GameState, time: Clock = clock) {
    this.state = state;
    this.time = time;
  }

  /**
   * Cold start and every `resume`. Applies the away period, rewrites
   * `lastSeenUtc`, and returns what changed for the return card.
   */
  catchUp(nowMs: number = this.time.now()): OfflineReport {
    const report = simulateOffline({
      stats: this.state.stats,
      isSleeping: this.state.isSleeping,
      lastSeenUtc: this.state.lastSeenUtc,
      nowMs,
    });

    if (report.clockWentBackwards) {
      // Spec §6: apply zero decay, reset the stamp, log it. Do not punish.
      console.warn(
        '[Clock] device clock moved backwards by',
        Math.round(-report.elapsedHours * 60),
        'minutes — skipping offline decay',
      );
    }
    if (report.suspiciousJump) {
      console.warn(
        '[Clock] implausible forward jump of',
        Math.round(report.elapsedHours),
        'hours — clamped to the offline cap',
      );
    }

    this.state.setStats(report.after);
    if (report.wokeUp) {
      this.state.setSleeping(false, nowMs);
    }
    this.state.setLastSeen(nowMs);
    this.lastTickMs = nowMs;
    this.accumulatorMs = 0;
    return report;
  }

  /**
   * Per-frame advance, driven by the CLOCK rather than by the frame delta.
   *
   * Frame deltas lie: a device dropping to 30fps, or a throttled webview,
   * hands back less time than actually passed, and the pet would then decay
   * more slowly than the offline simulation says it should. Reading the clock
   * keeps the foreground and the away path telling the same story.
   */
  tick(nowMs: number = this.time.now()): void {
    if (this.lastTickMs === null) {
      this.lastTickMs = nowMs;
      return;
    }

    const elapsedMs = nowMs - this.lastTickMs;
    this.lastTickMs = nowMs;

    // A backwards clock is handled by catchUp, never here: skip the frame.
    if (elapsedMs <= 0) return;

    // Backgrounded or hard-throttled: the capped offline path owns this gap.
    if (elapsedMs > FOREGROUND_GAP_MS) {
      this.catchUp(nowMs);
      return;
    }

    this.accumulatorMs += elapsedMs;

    // Apply in whole seconds; anything finer is below the display resolution
    // and would mark the save dirty on every single frame.
    const wholeSeconds = Math.floor(this.accumulatorMs / 1000);
    if (wholeSeconds <= 0) return;
    this.accumulatorMs -= wholeSeconds * 1000;

    const hours = wholeSeconds / 3600;
    const next = this.state.isSleeping
      ? decayAsleep(this.state.stats, hours)
      : decayAwake(this.state.stats, hours);

    this.state.setStats(next);
    this.state.addPlaySeconds(wholeSeconds);
    this.state.setLastSeen(nowMs);

    if (this.state.isSleeping && this.state.stat('energy') >= SLEEP.autoWakeAt) {
      this.state.setSleeping(false, nowMs);
    }
  }

  /** True while any stat sits under its warn threshold. */
  static isLow(value: number, warnBelow: number): boolean {
    return value < warnBelow;
  }

  static get min(): number {
    return STAT_MIN;
  }

  static get max(): number {
    return STAT_MAX;
  }
}

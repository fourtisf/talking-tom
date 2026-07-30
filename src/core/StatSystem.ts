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
  RELIEF,
  SLEEP,
  STAT_DECAY_PER_HOUR,
  STAT_MAX,
  STAT_MIN,
} from '@/config/tuning';
import { clampRelief, clampStat, type GameState } from '@/core/GameState';
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
 * Extra pressure on ONE stat while there is a mess on the floor.
 *
 * Cleanliness only. An accident makes the room dirty, not the cat hungry — and
 * a multiplier that touched all four would be an unbounded punishment rather
 * than a consequence with a shape.
 */
export interface DecayOptions {
  /** There is an uncleared accident somewhere. See `RELIEF.messCleanMultiplier`. */
  messy?: boolean;
}

function rate(key: StatKey, options?: DecayOptions): number {
  const base = STAT_DECAY_PER_HOUR[key];
  return key === 'clean' && options?.messy ? base * RELIEF.messCleanMultiplier : base;
}

/**
 * Advance stats by `hours` of *waking* time. Continuous, not ticked: calling
 * this once with 3h is identical to calling it three times with 1h.
 *
 * `options` is optional and must stay optional: a dozen call sites, most of
 * them tests, pass exactly two positional arguments.
 */
export function decayAwake(
  stats: Readonly<PetStats>,
  hours: number,
  options?: DecayOptions,
): PetStats {
  const out = cloneStats(stats);
  if (hours <= 0) return out;
  for (const key of STAT_KEYS) {
    out[key] = clampStat(out[key] - rate(key, options) * hours);
  }
  return out;
}

/**
 * Advance the toilet need by `hours`.
 *
 * Its own function rather than a fifth key in `decayAwake`, because it has its
 * own floor: `clampStat` stops at `STAT_MIN` (5) so an empty meter never reads
 * as a dead pet, and 0 here means something specific — the moment the grace
 * countdown starts.
 */
export function decayRelief(relief: number, hours: number, isSleeping: boolean): number {
  if (hours <= 0) return clampRelief(relief);
  const perHour = RELIEF.decayPerHour * (isSleeping ? RELIEF.sleepDecayMultiplier : 1);
  return clampRelief(relief - perHour * hours);
}

/** Advance stats by `hours` of *sleeping* time. Energy climbs, hunger crawls. */
export function decayAsleep(
  stats: Readonly<PetStats>,
  hours: number,
  options?: DecayOptions,
): PetStats {
  const out = cloneStats(stats);
  if (hours <= 0) return out;
  for (const key of STAT_KEYS) {
    if (key === 'energy') {
      out.energy = clampStat(out.energy + SLEEP.energyRegenPerHour * hours);
      continue;
    }
    out[key] = clampStat(out[key] - rate(key, options) * sleepDecayMultiplier(key) * hours);
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
  /** Optional: a save from before the toilet need existed has none. */
  relief?: number;
  messy?: boolean;
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

  const reliefBefore = clampRelief(input.relief ?? RELIEF.max);
  const opts: DecayOptions = { messy: input.messy === true };

  let stats = cloneStats(input.stats);
  let relief = reliefBefore;
  let wokeUp = false;
  /** Hours of the window she spent awake — the only ones that can end badly. */
  let awakeHours = 0;

  if (resolution.appliedHours > 0) {
    if (input.isSleeping) {
      const restHours = hoursUntilRested(stats.energy);
      if (restHours <= resolution.appliedHours) {
        stats = decayAsleep(stats, restHours, opts);
        relief = decayRelief(relief, restHours, true);
        wokeUp = true;
        awakeHours = resolution.appliedHours - restHours;
        stats = decayAwake(stats, awakeHours, opts);
        relief = decayRelief(relief, awakeHours, false);
      } else {
        stats = decayAsleep(stats, resolution.appliedHours, opts);
        relief = decayRelief(relief, resolution.appliedHours, true);
      }
    } else {
      awakeHours = resolution.appliedHours;
      stats = decayAwake(stats, awakeHours, opts);
      relief = decayRelief(relief, awakeHours, false);
    }
  }

  /*
   * THE RULE THAT MAKES THIS SAFE: she only goes on the floor while you were
   * away if she had ALREADY ASKED, on screen, and you left anyway.
   *
   * Without the warn-gate, leaving a comfortable cat for eighteen hours would
   * return a puddle the player never saw coming — and a consequence the player
   * never saw arrive is a tax. With it, that same absence returns a desperate
   * cat with the bubble up and ninety seconds on the clock from the first
   * frame, which is a warning they can act on.
   *
   * She never wets the bed, so an absence spent entirely asleep is exempt. And
   * only ever ONE accident per absence however long it was: eighteen hours at
   * a nine-hour bladder implies two, and charging two is the kind of unbounded
   * punishment `OFFLINE.capHours` already exists to prevent.
   */
  const accident = awakeHours > 0 && reliefBefore < RELIEF.warnBelow && relief <= RELIEF.min;
  if (accident) {
    stats.clean = clampStat(stats.clean - RELIEF.accidentCleanPenalty);
    relief = RELIEF.max;
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
    reliefBefore,
    reliefAfter: relief,
    accident,
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

/** What the toilet need is doing right now, for whoever draws the bubble. */
export type ReliefState = 'fine' | 'asking' | 'desperate';

export function reliefState(relief: number): ReliefState {
  if (relief <= RELIEF.min) return 'desperate';
  return relief < RELIEF.warnBelow ? 'asking' : 'fine';
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
  /**
   * Seconds she has been at zero with the app open, or null if she is not.
   *
   * FOREGROUND ONLY, and not persisted. A player who backgrounds the app for
   * three minutes must not come back to a mess they were never given the
   * chance to prevent, so `catchUp` clears it — the away window has its own,
   * much stricter rule for booking an accident.
   */
  private pressingSeconds: number | null = null;
  /** Set when the foreground grace ran out. Read and cleared by the scene. */
  private pendingAccident = false;

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
      relief: this.state.relief,
      messy: this.state.messRoom !== null,
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
    this.state.setRelief(report.reliefAfter);
    if (report.wokeUp) {
      this.state.setSleeping(false, nowMs);
    }
    this.state.setLastSeen(nowMs);
    this.lastTickMs = nowMs;
    this.accumulatorMs = 0;
    // The away window has already decided whether she went; the foreground
    // clock starts fresh from this frame either way.
    this.pressingSeconds = null;
    this.pendingAccident = false;
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
    const messy: DecayOptions = { messy: this.state.messRoom !== null };
    const next = this.state.isSleeping
      ? decayAsleep(this.state.stats, hours, messy)
      : decayAwake(this.state.stats, hours, messy);

    this.state.setStats(next);
    this.state.setRelief(decayRelief(this.state.relief, hours, this.state.isSleeping));
    this.countDownToAccident(wholeSeconds);
    this.state.addPlaySeconds(wholeSeconds);
    this.state.setLastSeen(nowMs);

    if (this.state.isSleeping && this.state.stat('energy') >= SLEEP.autoWakeAt) {
      this.state.setSleeping(false, nowMs);
    }
  }

  /**
   * The ninety seconds between "she cannot wait" and "she did not".
   *
   * Deliberately wall-clock rather than stat-driven: at the floor there is no
   * number left to count down, and the player needs a fixed, generous window
   * in which acting still works. Suppressed while she is asleep — she never
   * wets the bed — and while a mess is already on the floor, because one mess
   * at a time is the whole reason the multiplier is bounded.
   */
  private countDownToAccident(seconds: number): void {
    const pressing =
      !this.state.isSleeping &&
      this.state.messRoom === null &&
      this.state.relief <= RELIEF.min;

    if (!pressing) {
      this.pressingSeconds = null;
      return;
    }
    this.pressingSeconds = (this.pressingSeconds ?? 0) + seconds;
    if (this.pressingSeconds >= RELIEF.graceSeconds) {
      this.pressingSeconds = null;
      this.pendingAccident = true;
    }
  }

  /**
   * True once, when the grace period has run out.
   *
   * Read-and-clear rather than an event, so a scene that is mid-transition
   * cannot miss it and a scene that restarts cannot see it twice.
   */
  takeAccident(): boolean {
    if (!this.pendingAccident) return false;
    this.pendingAccident = false;
    return true;
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

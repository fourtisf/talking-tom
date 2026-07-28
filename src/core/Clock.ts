/**
 * Server-time-aware `now()`. Spec §6 / §12: never trust the device clock alone.
 *
 * The device clock is the only source available offline, so it is still the
 * base. What this adds is:
 *
 *  - a monotonic guard: `performance.now()` advances even if the wall clock is
 *    dragged backwards mid-session, so a player cannot rewind time by changing
 *    the system date while the app is open;
 *  - an optional server offset, applied once a trusted timestamp is fetched
 *    (spec §12 — server sync is authoritative for `lastSeenUtc` only).
 *
 * Everything here is injectable so the offline tests can drive time by hand.
 */

export interface ClockSources {
  /** Wall-clock ms epoch. Defaults to `Date.now`. */
  wallNow: () => number;
  /** Monotonic ms since process start. Defaults to `performance.now`. */
  monotonicNow: () => number;
}

const defaultSources: ClockSources = {
  wallNow: () => Date.now(),
  monotonicNow: () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now(),
};

export class Clock {
  private readonly sources: ClockSources;

  /** Offset applied to wall time once a trusted server time is known. */
  private serverOffsetMs = 0;
  private hasServerTime = false;

  /** Anchor pair used to detect a wall clock that moved without time passing. */
  private anchorWall: number;
  private anchorMono: number;

  constructor(sources: Partial<ClockSources> = {}) {
    this.sources = { ...defaultSources, ...sources };
    this.anchorWall = this.sources.wallNow();
    this.anchorMono = this.sources.monotonicNow();
  }

  /**
   * Best available ms epoch.
   *
   * Within a single session the monotonic anchor wins whenever the wall clock
   * has slipped *behind* where elapsed monotonic time says it should be. Wall
   * time running ahead is allowed through — that is what a legitimate NTP
   * correction looks like, and §6 already caps forward jumps downstream.
   */
  now(): number {
    const wall = this.sources.wallNow() + this.serverOffsetMs;
    const monoElapsed = this.sources.monotonicNow() - this.anchorMono;
    const expected = this.anchorWall + this.serverOffsetMs + monoElapsed;

    if (wall < expected) return expected;

    // Wall time is at or ahead of the anchor: accept it and re-anchor.
    this.anchorWall = this.sources.wallNow();
    this.anchorMono = this.sources.monotonicNow();
    return wall;
  }

  /** Raw device wall clock, no correction. Used only for logging a drift. */
  deviceNow(): number {
    return this.sources.wallNow();
  }

  /**
   * Adopt a trusted server timestamp. `roundTripMs` compensates for the half
   * of the request that had already elapsed when the server stamped it.
   */
  syncToServer(serverEpochMs: number, roundTripMs = 0): void {
    const localAtResponse = this.sources.wallNow();
    this.serverOffsetMs = serverEpochMs + roundTripMs / 2 - localAtResponse;
    this.hasServerTime = true;
    this.anchorWall = localAtResponse;
    this.anchorMono = this.sources.monotonicNow();
  }

  get isServerSynced(): boolean {
    return this.hasServerTime;
  }

  get offsetMs(): number {
    return this.serverOffsetMs;
  }

  /** Re-anchor after a long background pause, where monotonic time may freeze. */
  reanchor(): void {
    this.anchorWall = this.sources.wallNow();
    this.anchorMono = this.sources.monotonicNow();
  }

  /** 'YYYY-MM-DD' in device-local time — the key ad and login caps reset on. */
  localDayKey(atMs: number = this.now()): string {
    const d = new Date(atMs);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Device-local hour 0..23. Used by the notification quiet window. */
  localHour(atMs: number = this.now()): number {
    return new Date(atMs).getHours();
  }
}

/** The app-wide clock. Tests construct their own. */
export const clock = new Clock();

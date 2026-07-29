/**
 * The sink that answers retention questions.
 *
 * `analytics.track()` has been called from thirty-odd places since the game was
 * written, and `register()` had never been called once — so every event landed
 * in an in-memory ring and died at process exit. There was no data at all about
 * where players stop, which meant every balance decision after that point was a
 * guess dressed as a judgement.
 *
 * This keeps a COMPACT AGGREGATE rather than a raw event stream: counters per
 * event name, the day the pet was installed, which day-Ns the player came back
 * on, the highest level reached. A stream would answer more questions and would
 * also grow without bound on a device the player did not volunteer for that.
 *
 * PRIVACY. No identifier is generated, no device is fingerprinted, nothing
 * leaves the device. This is a local diary the developer can read off a
 * handset. Player-authored content — a voice recording, a pet name — is never
 * an event property, and `sanitise()` below enforces the shape rather than
 * trusting call sites.
 */

import { ANALYTICS, MS_PER_DAY } from '@/config/tuning';
import type { KeyValueStore } from '@/core/storage';
import type { AnalyticsProps, AnalyticsSink } from '@/services/Analytics';

export interface FunnelData {
  /** First launch, ms since epoch. Everything day-shaped is relative to it. */
  installedAt: number;
  /** Event name -> times seen, ever. */
  counts: Record<string, number>;
  /** Day numbers (0 = install day) the player opened the game on. */
  activeDays: number[];
  maxLevel: number;
  /** Last write, so a stale diary is visible as stale. */
  updatedAt: number;
}

export function createFunnel(nowMs: number): FunnelData {
  return { installedAt: nowMs, counts: {}, activeDays: [], maxLevel: 1, updatedAt: nowMs };
}

/** Whole days since install. Uses elapsed ms, so a DST shift cannot skip a day. */
export function dayNumber(installedAt: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - installedAt) / MS_PER_DAY));
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Total, in the same spirit as `SaveManager.validate`: a corrupt diary must
 * degrade to an empty one, never throw. Losing diagnostics is a nuisance;
 * throwing on boot because of them would be absurd.
 */
export function parseFunnel(raw: string | null, nowMs: number): FunnelData {
  const fresh = createFunnel(nowMs);
  if (!raw) return fresh;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fresh;
    const record = parsed as Record<string, unknown>;

    const counts: Record<string, number> = {};
    const rawCounts = record['counts'];
    if (typeof rawCounts === 'object' && rawCounts !== null) {
      for (const [key, value] of Object.entries(rawCounts as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          counts[key] = Math.floor(value);
        }
      }
    }

    const activeDays = Array.isArray(record['activeDays'])
      ? [...new Set(record['activeDays'].filter((d): d is number => typeof d === 'number' && d >= 0))].sort(
          (a, b) => a - b,
        )
      : [];

    return {
      installedAt: num(record['installedAt'], nowMs),
      counts,
      activeDays,
      maxLevel: Math.max(1, Math.floor(num(record['maxLevel'], 1))),
      updatedAt: num(record['updatedAt'], nowMs),
    };
  } catch {
    return fresh;
  }
}

/**
 * Reject anything that is not a small scalar.
 *
 * Enforced here rather than trusted at the call sites: there are thirty of
 * them and there will be more, and it only takes one passing a transcript of
 * what the player said to turn a counter file into a recording of them.
 */
export function sanitise(props: AnalyticsProps): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'number') out[key] = Number.isFinite(value) ? value : 0;
    else if (typeof value === 'boolean' || value === null) out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 40);
  }
  return out;
}

export class AnalyticsFunnel implements AnalyticsSink {
  private data: FunnelData;
  private readonly store: KeyValueStore;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(data: FunnelData, store: KeyValueStore, now: () => number) {
    this.data = data;
    this.store = store;
    this.now = now;
  }

  static async load(store: KeyValueStore, now: () => number): Promise<AnalyticsFunnel> {
    let raw: string | null = null;
    try {
      raw = await store.get(ANALYTICS.funnelKey);
    } catch {
      // A diary that cannot be read is a diary that starts today.
    }
    const funnel = new AnalyticsFunnel(parseFunnel(raw, now()), store, now);
    funnel.noteActiveDay();
    return funnel;
  }

  get snapshot(): Readonly<FunnelData> {
    return this.data;
  }

  track(event: string, props: AnalyticsProps): void {
    const clean = sanitise(props);
    this.data.counts[event] = (this.data.counts[event] ?? 0) + 1;

    // Level is the one property worth keeping as a value rather than a count:
    // "how far did anyone get" is not derivable from "level_up happened N times"
    // once a save is restored from a backup code.
    const level = clean['level'];
    if (event === 'level_up' && typeof level === 'number') {
      this.data.maxLevel = Math.max(this.data.maxLevel, level);
    }

    this.scheduleWrite();
  }

  private noteActiveDay(): void {
    const day = dayNumber(this.data.installedAt, this.now());
    if (!this.data.activeDays.includes(day)) {
      this.data.activeDays.push(day);
      this.data.activeDays.sort((a, b) => a - b);
      this.scheduleWrite();
    }
  }

  private scheduleWrite(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ANALYTICS.writeDebounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.data.updatedAt = this.now();
    try {
      await this.store.set(ANALYTICS.funnelKey, JSON.stringify(this.data));
    } catch {
      // Diagnostics must never be the reason a session fails.
    }
  }

  /** Wipe the diary without touching the pet. */
  async clear(): Promise<void> {
    this.data = createFunnel(this.now());
    try {
      await this.store.remove(ANALYTICS.funnelKey);
    } catch {
      // Same reasoning as flush().
    }
  }
}

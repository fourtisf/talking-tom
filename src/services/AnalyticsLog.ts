/**
 * The last stretch of events, kept so a crash leaves a trail.
 *
 * The funnel answers "how many"; this answers "what happened just before it
 * went wrong", which is the only question worth asking about a bug report that
 * says "it froze". Bounded twice — by entry count AND by serialised size —
 * because one event carrying a long string would otherwise let a fixed entry
 * count grow an unbounded file.
 */

import { ANALYTICS } from '@/config/tuning';
import type { KeyValueStore } from '@/core/storage';
import { sanitise } from '@/services/AnalyticsFunnel';
import type { AnalyticsProps, AnalyticsSink } from '@/services/Analytics';

export interface LogEntry {
  readonly at: number;
  readonly event: string;
  readonly props: AnalyticsProps;
}

export function trim(entries: readonly LogEntry[]): LogEntry[] {
  let out = entries.slice(-ANALYTICS.logMaxEntries);
  // Drop from the FRONT: the newest events are the ones a crash report needs.
  while (out.length > 1 && JSON.stringify(out).length > ANALYTICS.logMaxBytes) {
    out = out.slice(Math.ceil(out.length / 8));
  }
  return out;
}

export class AnalyticsLog implements AnalyticsSink {
  private entries: LogEntry[] = [];
  private readonly store: KeyValueStore;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(store: KeyValueStore, now: () => number) {
    this.store = store;
    this.now = now;
  }

  get recent(): readonly LogEntry[] {
    return this.entries;
  }

  track(event: string, props: AnalyticsProps): void {
    this.entries.push({ at: this.now(), event, props: sanitise(props) });
    this.entries = trim(this.entries);
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, ANALYTICS.writeDebounceMs);
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await this.store.set(ANALYTICS.logKey, JSON.stringify(this.entries));
    } catch {
      // Diagnostics must never be the reason a session fails.
    }
  }
}

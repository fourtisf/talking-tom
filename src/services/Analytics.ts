/**
 * Analytics fan-out.
 *
 * No vendor SDK is wired for v1 — `register()` accepts one, and until then
 * events land in a bounded in-memory ring plus the console in dev. The point of
 * shipping it now is spec §7: `Economy` refuses to move money without a
 * reason/source string, and those strings are worthless if nothing receives
 * them.
 */

export type AnalyticsProps = Record<string, string | number | boolean | null>;

export interface AnalyticsSink {
  track(event: string, props: AnalyticsProps): void;
}

const RING_SIZE = 200;

class AnalyticsService {
  private sinks: AnalyticsSink[] = [];
  private readonly ring: { event: string; props: AnalyticsProps; at: number }[] = [];

  register(sink: AnalyticsSink): void {
    this.sinks.push(sink);
  }

  track(event: string, props: AnalyticsProps = {}): void {
    const entry = { event, props, at: Date.now() };
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();

    if (import.meta.env.DEV) {
      console.debug('[analytics]', event, props);
    }
    for (const sink of this.sinks) {
      try {
        sink.track(event, props);
      } catch (err) {
        console.warn('[analytics] sink threw', err);
      }
    }
  }

  /** Recent events — used by the debug overlay and by tests. */
  recent(): readonly { event: string; props: AnalyticsProps; at: number }[] {
    return this.ring;
  }

  reset(): void {
    this.ring.length = 0;
    this.sinks = [];
  }
}

export const analytics = new AnalyticsService();

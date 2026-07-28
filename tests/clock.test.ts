import { describe, expect, it } from 'vitest';

import { Clock } from '@/core/Clock';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

function controllable(startWall = T0) {
  let wall = startWall;
  let mono = 0;
  const clock = new Clock({ wallNow: () => wall, monotonicNow: () => mono });
  return {
    clock,
    advance(ms: number) {
      wall += ms;
      mono += ms;
    },
    /** Move the wall clock only — what a player fiddling with settings does. */
    setWall(ms: number) {
      wall = ms;
    },
    tickMono(ms: number) {
      mono += ms;
    },
  };
}

describe('Clock (§6 / §12)', () => {
  it('tracks the wall clock while it behaves', () => {
    const { clock, advance } = controllable();
    expect(clock.now()).toBe(T0);
    advance(5000);
    expect(clock.now()).toBe(T0 + 5000);
  });

  it('ignores a wall clock dragged backwards mid-session', () => {
    const { clock, advance, setWall } = controllable();
    advance(60_000);
    expect(clock.now()).toBe(T0 + 60_000);

    // Player winds the device clock back an hour without time passing.
    setWall(T0 - 3_600_000);
    expect(clock.now()).toBeGreaterThanOrEqual(T0 + 60_000);
  });

  it('accepts a forward correction — that is what NTP looks like', () => {
    const { clock, advance, setWall } = controllable();
    advance(1000);
    setWall(T0 + 90_000);
    expect(clock.now()).toBe(T0 + 90_000);
  });

  it('adopts a server offset and reports being synced', () => {
    const { clock } = controllable();
    expect(clock.isServerSynced).toBe(false);
    clock.syncToServer(T0 + 10_000, 200);
    expect(clock.isServerSynced).toBe(true);
    expect(clock.offsetMs).toBeCloseTo(10_100, 6);
    expect(clock.now()).toBeCloseTo(T0 + 10_100, 6);
  });

  it('keeps the raw device clock available for logging', () => {
    const { clock, setWall } = controllable();
    setWall(T0 - 999);
    expect(clock.deviceNow()).toBe(T0 - 999);
  });

  it('formats a device-local day key', () => {
    const clock = new Clock();
    const key = clock.localDayKey(new Date(2026, 2, 9, 15, 30).getTime());
    expect(key).toBe('2026-03-09');
  });

  it('reports the device-local hour for the quiet window', () => {
    const clock = new Clock();
    expect(clock.localHour(new Date(2026, 2, 9, 23, 15).getTime())).toBe(23);
    expect(clock.localHour(new Date(2026, 2, 9, 7, 59).getTime())).toBe(7);
  });
});

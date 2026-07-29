/**
 * The analytics sinks.
 *
 * The bug these exist to fix was not a wrong number — it was that
 * `analytics.register()` had never been called, so every event in the codebase
 * went into an in-memory ring and died. So the first thing worth testing is
 * that a sink actually receives, and the rest is: it must never throw, never
 * grow without bound, and never carry player-authored text.
 */

import { describe, expect, it, vi } from 'vitest';

import { ANALYTICS, MS_PER_DAY } from '@/config/tuning';
import { MemoryStore } from '@/core/storage';
import { AnalyticsFunnel, createFunnel, dayNumber, parseFunnel, sanitise } from '@/services/AnalyticsFunnel';
import { AnalyticsLog, trim } from '@/services/AnalyticsLog';
import type { LogEntry } from '@/services/AnalyticsLog';

const T0 = Date.UTC(2026, 6, 29, 9, 0, 0);

describe('sanitise', () => {
  it('keeps small scalars', () => {
    expect(sanitise({ level: 4, ok: true, nothing: null, id: 'halo' })).toEqual({
      level: 4,
      ok: true,
      nothing: null,
      id: 'halo',
    });
  });

  it('truncates strings, so one call site cannot turn a counter file into a transcript', () => {
    const long = 'a'.repeat(500);
    const out = sanitise({ said: long });
    expect(String(out['said']).length).toBe(40);
  });

  it('replaces a non-finite number rather than serialising null through JSON', () => {
    // JSON.stringify turns Infinity into null, which would silently become a
    // different type on the way back out of storage.
    expect(sanitise({ n: Number.POSITIVE_INFINITY })).toEqual({ n: 0 });
    expect(sanitise({ n: Number.NaN })).toEqual({ n: 0 });
  });
});

describe('dayNumber', () => {
  it('counts whole elapsed days, so a DST shift cannot skip one', () => {
    expect(dayNumber(T0, T0)).toBe(0);
    expect(dayNumber(T0, T0 + MS_PER_DAY - 1)).toBe(0);
    expect(dayNumber(T0, T0 + MS_PER_DAY)).toBe(1);
    expect(dayNumber(T0, T0 + MS_PER_DAY * 30)).toBe(30);
  });

  it('never goes negative when the device clock moves backwards', () => {
    expect(dayNumber(T0, T0 - MS_PER_DAY * 5)).toBe(0);
  });
});

describe('parseFunnel', () => {
  it('starts fresh on nothing, on junk, and on the wrong shape', () => {
    for (const raw of [null, '', 'not json', '[]', '{"counts":42}']) {
      const out = parseFunnel(raw, T0);
      expect(out.counts).toEqual({});
      expect(out.maxLevel).toBe(1);
    }
  });

  it('drops impossible counts rather than rejecting the whole file', () => {
    const raw = JSON.stringify({ installedAt: T0, counts: { good: 3, bad: -1, worse: 'x' }, activeDays: [0, 2] });
    const out = parseFunnel(raw, T0);
    expect(out.counts).toEqual({ good: 3 });
    expect(out.activeDays).toEqual([0, 2]);
  });

  it('round-trips a real diary', () => {
    const original = createFunnel(T0);
    original.counts = { fed: 12 };
    original.activeDays = [0, 1, 4];
    original.maxLevel = 7;
    expect(parseFunnel(JSON.stringify(original), T0)).toEqual(original);
  });
});

describe('AnalyticsFunnel', () => {
  it('counts events and records the day it was opened on', async () => {
    const store = new MemoryStore();
    const funnel = await AnalyticsFunnel.load(store, () => T0);

    funnel.track('fed', { food: 'fish' });
    funnel.track('fed', { food: 'milk' });
    funnel.track('level_up', { level: 5 });

    expect(funnel.snapshot.counts).toEqual({ fed: 2, level_up: 1 });
    expect(funnel.snapshot.activeDays).toEqual([0]);
    expect(funnel.snapshot.maxLevel).toBe(5);
  });

  it('keeps the highest level, not the latest — a restore can move it down', async () => {
    const funnel = await AnalyticsFunnel.load(new MemoryStore(), () => T0);
    funnel.track('level_up', { level: 9 });
    funnel.track('level_up', { level: 2 });
    expect(funnel.snapshot.maxLevel).toBe(9);
  });

  it('persists, and adds a second active day on a later visit', async () => {
    const store = new MemoryStore();
    let now = T0;

    const first = await AnalyticsFunnel.load(store, () => now);
    first.track('fed', {});
    await first.flush();

    now = T0 + MS_PER_DAY * 3;
    const second = await AnalyticsFunnel.load(store, () => now);
    expect(second.snapshot.counts).toEqual({ fed: 1 });
    expect(second.snapshot.activeDays).toEqual([0, 3]);
    expect(second.snapshot.installedAt).toBe(T0);
  });

  it('survives a store that throws, because diagnostics must never break a session', async () => {
    const broken = {
      get: vi.fn().mockRejectedValue(new Error('nope')),
      set: vi.fn().mockRejectedValue(new Error('nope')),
      remove: vi.fn().mockRejectedValue(new Error('nope')),
    };
    const funnel = await AnalyticsFunnel.load(broken, () => T0);
    funnel.track('fed', {});
    await expect(funnel.flush()).resolves.toBeUndefined();
    await expect(funnel.clear()).resolves.toBeUndefined();
  });
});

describe('AnalyticsLog', () => {
  const entry = (i: number, pad = ''): LogEntry => ({ at: T0 + i, event: `e${i}`, props: { pad } });

  it('keeps the newest entries when the count is exceeded', () => {
    const kept = trim(Array.from({ length: ANALYTICS.logMaxEntries + 40 }, (_, i) => entry(i)));
    expect(kept.length).toBeLessThanOrEqual(ANALYTICS.logMaxEntries);
    expect(kept[kept.length - 1]?.event).toBe(`e${ANALYTICS.logMaxEntries + 39}`);
  });

  it('is bounded by BYTES too, so one fat event cannot grow the file', () => {
    // Well under the entry cap, but far over the byte cap.
    const fat = Array.from({ length: 30 }, (_, i) => entry(i, 'x'.repeat(2000)));
    const kept = trim(fat);
    expect(JSON.stringify(kept).length).toBeLessThanOrEqual(ANALYTICS.logMaxBytes);
    expect(kept.length).toBeGreaterThan(0);
    // Still the newest ones.
    expect(kept[kept.length - 1]?.event).toBe('e29');
  });

  it('sanitises on the way in', () => {
    const log = new AnalyticsLog(new MemoryStore(), () => T0);
    log.track('said', { text: 'y'.repeat(300) });
    expect(String(log.recent[0]?.props['text']).length).toBe(40);
  });
});

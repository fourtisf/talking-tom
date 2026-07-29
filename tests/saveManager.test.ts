import { describe, expect, it } from 'vitest';

import { SaveManager, checksum, migrate, validate } from '@/core/SaveManager';
import { GameState, createDefaultSave } from '@/core/GameState';
import { MemoryStore } from '@/core/storage';
import { SAVE, STARTING } from '@/config/tuning';
import { Clock } from '@/core/Clock';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const fixedClock = new Clock({ wallNow: () => T0, monotonicNow: () => 0 });

function makeManager(store = new MemoryStore(), debounceMs = 0) {
  const state = new GameState(createDefaultSave(T0));
  const manager = new SaveManager(state, { store, time: fixedClock, debounceMs });
  return { state, manager, store };
}

describe('validate (§12)', () => {
  it('accepts a well-formed save unchanged', () => {
    const save = createDefaultSave(T0);
    save.coins = 1234;
    save.level = 7;
    expect(validate(save, T0)).toEqual(save);
  });

  it('restores defaults for a non-object', () => {
    expect(validate(null, T0).coins).toBe(STARTING.coins);
    expect(validate('nonsense', T0).level).toBe(STARTING.level);
    expect(validate([1, 2, 3], T0).gems).toBe(STARTING.gems);
  });

  it('repairs individual bad fields instead of dropping the whole save', () => {
    const out = validate(
      {
        version: 1,
        coins: 'lots',
        gems: Number.NaN,
        level: -4,
        xp: null,
        stats: { hunger: 'full', energy: 84, fun: 999, clean: -20 },
        ownedItems: ['beanie', 42, null, 'crown'],
        equipped: { hat: 'beanie', outfit: 7 },
        lastSeenUtc: 'yesterday',
      },
      T0,
    );

    expect(out.coins).toBe(STARTING.coins);
    expect(out.gems).toBe(STARTING.gems);
    expect(out.level).toBe(1);
    expect(out.stats.energy).toBe(84); // the one good stat survives
    expect(out.stats.fun).toBe(100); // clamped
    expect(out.stats.clean).toBe(0); // clamped, floor is applied at runtime
    expect(out.ownedItems).toEqual(['beanie', 'crown']);
    expect(out.equipped).toEqual({ hat: 'beanie', outfit: null });
    expect(out.lastSeenUtc).toBe(T0);
  });

  it('repairs a sleeping save with no sleep stamp', () => {
    const out = validate({ isSleeping: true, sleepStartedUtc: null, lastSeenUtc: T0 }, T0);
    expect(out.sleepStartedUtc).toBe(T0);
  });

  it('clears a stale sleep stamp on an awake save', () => {
    const out = validate({ isSleeping: false, sleepStartedUtc: T0 }, T0);
    expect(out.sleepStartedUtc).toBeNull();
  });
});

describe('migrate (§12)', () => {
  it('stamps the current version on a versionless blob', () => {
    expect(migrate({ coins: 10 })['version']).toBe(SAVE.version);
  });

  it('leaves a save from a newer build alone but stamps it back down', () => {
    const out = migrate({ version: 99, coins: 10 });
    expect(out['version']).toBe(SAVE.version);
    expect(out['coins']).toBe(10);
  });
});

describe('checksum', () => {
  it('is stable and sensitive', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
    expect(checksum('')).toBeTypeOf('number');
  });
});

describe('SaveManager round-trip', () => {
  it('returns false and hydrates defaults on a first run', async () => {
    const { state, manager } = makeManager();
    expect(await manager.load()).toBe(false);
    expect(state.coins).toBe(STARTING.coins);
  });

  it('persists and reloads state', async () => {
    const store = new MemoryStore();
    const a = makeManager(store);
    a.state.setProgress(6, 12);
    a.state.addItem('crown');
    a.state.equip('hat', 'crown');
    await a.manager.flush();

    const b = makeManager(store);
    expect(await b.manager.load()).toBe(true);
    expect(b.state.level).toBe(6);
    expect(b.state.xp).toBe(12);
    expect(b.state.ownedItems).toEqual(['crown']);
    expect(b.state.equipped.hat).toBe('crown');
  });

  it('persists the sound and music switches independently (§11)', async () => {
    const store = new MemoryStore();
    const a = makeManager(store);
    a.state.setMusicMuted(true);
    await a.manager.flush();

    const b = makeManager(store);
    expect(await b.manager.load()).toBe(true);
    expect(b.state.musicMuted).toBe(true);
    // Muting the music must not take the SFX with it.
    expect(b.state.muted).toBe(false);
  });

  it('defaults music on for a save written before the switch existed', () => {
    const { musicMuted, ...legacy } = createDefaultSave(T0);
    void musicMuted;
    expect(validate(legacy, T0).musicMuted).toBe(false);
  });

  it('restores a safe default on a corrupt blob rather than crashing', async () => {
    const store = new MemoryStore();
    await store.set(SAVE.key, '{"data":{"coins":5,,,');
    const { state, manager } = makeManager(store);
    expect(await manager.load()).toBe(false);
    expect(state.coins).toBe(STARTING.coins);
  });

  it('still salvages a save whose checksum does not match', async () => {
    const store = new MemoryStore();
    const data = createDefaultSave(T0);
    data.coins = 777;
    await store.set(SAVE.key, JSON.stringify({ v: 1, checksum: 12345, data }));

    const { state, manager } = makeManager(store);
    expect(await manager.load()).toBe(true);
    expect(state.coins).toBe(777);
  });

  it('reads a bare payload written without an envelope', async () => {
    const store = new MemoryStore();
    const data = createDefaultSave(T0);
    data.coins = 42;
    await store.set(SAVE.key, JSON.stringify(data));

    const { state, manager } = makeManager(store);
    expect(await manager.load()).toBe(true);
    expect(state.coins).toBe(42);
  });

  it('debounces writes and flushes on demand (force-quit safety, §15)', async () => {
    const store = new MemoryStore();
    const state = new GameState(createDefaultSave(T0));
    const manager = new SaveManager(state, { store, time: fixedClock, debounceMs: 20 });
    manager.attach();

    state.setStat('fun', 90);
    state.setStat('fun', 91);
    state.setStat('fun', 92);
    // Nothing on disk yet — the debounce window is still open.
    expect(await store.get(SAVE.key)).toBeNull();

    await manager.flush();
    const written = await store.get(SAVE.key);
    expect(written).not.toBeNull();
    expect(JSON.parse(written as string).data.stats.fun).toBe(92);
    manager.detach();
  });

  it('survives a store that throws on read', async () => {
    const throwing = {
      get: () => Promise.reject(new Error('device is on fire')),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    const state = new GameState(createDefaultSave(T0));
    const manager = new SaveManager(state, { store: throwing, time: fixedClock });
    expect(await manager.load()).toBe(false);
    expect(state.coins).toBe(STARTING.coins);
  });
});

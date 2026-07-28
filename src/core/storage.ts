/**
 * Key/value storage behind an interface.
 *
 * Production uses Capacitor Preferences (spec §2.4 / §12 — never localStorage
 * directly; iOS evicts it). Tests and the pure-node vitest run use the memory
 * adapter, which is why this seam exists at all.
 */

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}

/**
 * Capacitor Preferences adapter. Imported lazily so the core bundle and the
 * node test run never touch the plugin.
 */
export class PreferencesStore implements KeyValueStore {
  async get(key: string): Promise<string | null> {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
  }
}

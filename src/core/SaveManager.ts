/**
 * Serialise, load, migrate, integrity-check. Spec §12.
 *
 * Contract:
 *  - a corrupt or unparseable blob restores a safe default, never crashes;
 *  - unknown/older `version` values run through the migration chain;
 *  - writes are debounced 500ms and forced on `pause`, so a force-quit
 *    mid-action loses at most half a second.
 */

import { RELIEF, SAVE } from '@/config/tuning';
import { clock, type Clock } from '@/core/Clock';
import { clampRelief, createDefaultSave, type GameState } from '@/core/GameState';
import { STAT_KEYS, type RoomKey, type SaveData } from '@/core/types';
import { MemoryStore, type KeyValueStore } from '@/core/storage';
import { analytics } from '@/services/Analytics';

/** Envelope written to disk: payload plus a cheap integrity stamp. */
interface SaveEnvelope {
  v: number;
  checksum: number;
  data: SaveData;
}

/**
 * FNV-1a over the serialised payload. Not security — this only has to notice a
 * truncated or hand-edited blob, which it does for a few microseconds a write.
 */
export function checksum(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A migration takes the previous shape and returns the next one. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version being migrated *from*. Empty at v1 — the first entry
 * lands the day `SAVE.version` becomes 2.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Player-typed text, cleaned to something safe to store and display.
 *
 * This is the only free text in the whole save. It reaches a Phaser label, a
 * lock-screen notification and — once saves sync — a row in a database, so it
 * is cleaned at the boundary rather than at each of those. Control characters
 * go (they break text layout and log lines), runs of whitespace collapse, and
 * the length is capped so a label cannot be pushed off its card.
 *
 * NOT rejected for content. There is no profanity list here: this name is shown
 * to the person who typed it and to nobody else, and a filter that fires on a
 * real person's name is a worse outcome than one that does not fire on a rude
 * one.
 */
export const NAME_MAX_LENGTH = 16;

export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return (
    value
      // Two different things wear the same "control character" label, and they
      // deserve opposite treatment. A tab or a newline is a SEPARATOR: deleting
      // it welds the words either side together, so a name pasted across a line
      // break came out "linebreak" instead of "line break". A NUL or a bell is
      // GARBAGE sitting inside a word, and turning it into a space splits a
      // word that was never two.
      .replace(/[\t\n\v\f\r]/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NAME_MAX_LENGTH)
  );
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** Task id -> count. Non-numeric or negative entries are dropped, not zeroed. */
function countMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      out[key] = Math.floor(raw);
    }
  }
  return out;
}

/**
 * Coerce an arbitrary parsed object into a valid `SaveData`, field by field.
 *
 * Deliberately total: any field that fails validation falls back to its default
 * rather than rejecting the whole save. Losing one corrupt field beats wiping a
 * player's level 14 pet.
 */
/** Rooms she can actually stand in. 'play' is a launcher, never a floor. */
const MESS_ROOMS: readonly RoomKey[] = ['home', 'kitchen', 'bath', 'bed'];

export function validate(raw: unknown, nowMs: number): SaveData {
  const def = createDefaultSave(nowMs);
  if (!isRecord(raw)) return def;

  const stats = isRecord(raw['stats']) ? raw['stats'] : {};
  const equipped = isRecord(raw['equipped']) ? raw['equipped'] : {};

  // Any sign of prior play. Used only to decide whether the tutorial is owed:
  // a save written before it existed belongs to someone who already knows the
  // game, and replaying onboarding on their pet is worse than skipping it.
  const hasPlayed =
    num(raw['level'], 1) > 1 ||
    num(raw['xp'], 0) > 0 ||
    num(raw['totalPlaySeconds'], 0) > 0 ||
    strArray(raw['ownedItems']).length > 0;

  const out: SaveData = {
    version: num(raw['version'], def.version),
    rev: Math.max(0, Math.floor(num(raw['rev'], 0))),
    playerName: cleanName(raw['playerName']),
    petName: cleanName(raw['petName']),
    stats: { ...def.stats },
    coins: Math.max(0, Math.floor(num(raw['coins'], def.coins))),
    gems: Math.max(0, Math.floor(num(raw['gems'], def.gems))),
    level: Math.max(1, Math.floor(num(raw['level'], def.level))),
    xp: Math.max(0, num(raw['xp'], def.xp)),
    ownedItems: strArray(raw['ownedItems']),
    equipped: {
      hat: typeof equipped['hat'] === 'string' ? equipped['hat'] : null,
      outfit: typeof equipped['outfit'] === 'string' ? equipped['outfit'] : null,
    },
    isSleeping: bool(raw['isSleeping'], def.isSleeping),
    lastSeenUtc: num(raw['lastSeenUtc'], nowMs),
    sleepStartedUtc:
      typeof raw['sleepStartedUtc'] === 'number' && Number.isFinite(raw['sleepStartedUtc'])
        ? raw['sleepStartedUtc']
        : null,
    adWatchesToday: Math.max(0, Math.floor(num(raw['adWatchesToday'], 0))),
    adDayKey: str(raw['adDayKey'], def.adDayKey),
    totalPlaySeconds: Math.max(0, num(raw['totalPlaySeconds'], 0)),
    dailyLoginDayKey: str(raw['dailyLoginDayKey'], def.dailyLoginDayKey),
    dailyLoginStreak: Math.max(0, Math.floor(num(raw['dailyLoginStreak'], 0))),
    notificationsSentToday: Math.max(0, Math.floor(num(raw['notificationsSentToday'], 0))),
    notificationDayKey: str(raw['notificationDayKey'], def.notificationDayKey),
    // Absent means never shared, which is what '' says. No migration needed:
    // an existing player's first share is their first share.
    photoDayKey: str(raw['photoDayKey'], ''),
    // Absent means a save from before awards shipped. Empty, not seeded: the
    // counts rebuild from play, and back-filling them from `totalPlaySeconds`
    // or an item count would hand out gems for things nobody did.
    lifetime: countMap(raw['lifetime']),
    awardsClaimed: strArray(raw['awardsClaimed']),
    muted: bool(raw['muted'], def.muted),
    musicMuted: bool(raw['musicMuted'], def.musicMuted),
    taskDayKey: str(raw['taskDayKey'], def.taskDayKey),
    taskIds: strArray(raw['taskIds']),
    taskCounts: countMap(raw['taskCounts']),
    taskClaimed: strArray(raw['taskClaimed']),
    // A save from before the tutorial existed has played the game already, so
    // it starts at -1: replaying onboarding for an existing pet is worse than
    // never showing it.
    tutorialStep: Math.trunc(num(raw['tutorialStep'], hasPlayed ? -1 : def.tutorialStep)),
    /*
     * An ABSENT relief defaults to full, not to `STARTING.relief`.
     *
     * A pet who has never had this need cannot be behind on it. That default,
     * plus the rule that an offline accident only books if she had already
     * asked on screen, is what makes the whole feature migration-free: every
     * existing save loads with a comfortable cat rather than one who wet the
     * floor while its owner was updating the app.
     */
    relief: clampRelief(num(raw['relief'], RELIEF.max)),
    messRoom: MESS_ROOMS.includes(raw['messRoom'] as RoomKey)
      ? (raw['messRoom'] as RoomKey)
      : null,
  };

  for (const key of STAT_KEYS) {
    const v = num(stats[key], def.stats[key]);
    // Clamp here rather than in GameState so a hand-edited 9999 cannot ride in.
    out.stats[key] = Math.min(100, Math.max(0, v));
  }

  // A save claiming to be asleep but with no start stamp is inconsistent; the
  // pet stays asleep and the stamp is repaired, because catch-up only needs the
  // flag and `lastSeenUtc`.
  if (out.isSleeping && out.sleepStartedUtc === null) {
    out.sleepStartedUtc = out.lastSeenUtc;
  }
  if (!out.isSleeping) {
    out.sleepStartedUtc = null;
  }

  return out;
}

/** Run the migration chain from `data.version` up to `SAVE.version`. */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let data = raw;
  let version = typeof data['version'] === 'number' ? data['version'] : 0;

  // A save from the future (downgraded app) is left alone; `validate` will
  // salvage the fields this build understands.
  while (version < SAVE.version) {
    const step = MIGRATIONS[version];
    if (!step) break;
    data = step(data);
    version += 1;
    data['version'] = version;
  }
  data['version'] = SAVE.version;
  return data;
}

export interface SaveManagerOptions {
  store?: KeyValueStore;
  time?: Clock;
  debounceMs?: number;
  /** Fired after a successful local write, so sync can queue a push. */
  onWritten?: () => void;
}

export class SaveManager {
  private readonly state: GameState;
  private readonly store: KeyValueStore;
  private readonly time: Clock;
  private readonly debounceMs: number;

  private readonly onWritten: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private detachDirty: (() => void) | null = null;

  constructor(state: GameState, options: SaveManagerOptions = {}) {
    this.state = state;
    this.store = options.store ?? new MemoryStore();
    this.time = options.time ?? clock;
    this.debounceMs = options.debounceMs ?? SAVE.debounceMs;
    this.onWritten = options.onWritten;
  }

  /** Subscribe to `dirty` so every meaningful mutation schedules a write. */
  attach(): void {
    if (this.detachDirty) return;
    this.detachDirty = this.state.events.on('dirty', () => this.scheduleWrite());
  }

  detach(): void {
    this.detachDirty?.();
    this.detachDirty = null;
  }

  /**
   * Load and hydrate. Returns `false` when nothing usable was on disk, so the
   * caller knows this is a first run (daily-login day 1, no return card).
   */
  async load(): Promise<boolean> {
    const nowMs = this.time.now();
    let text: string | null = null;
    try {
      text = await this.store.get(SAVE.key);
    } catch (err) {
      console.warn('[SaveManager] read failed', err);
    }

    if (!text) {
      this.state.hydrate(createDefaultSave(nowMs));
      return false;
    }

    try {
      const parsed: unknown = JSON.parse(text);
      let payload: unknown = parsed;

      if (isRecord(parsed) && 'data' in parsed && 'checksum' in parsed) {
        const envelope = parsed as unknown as SaveEnvelope;
        const serialised = JSON.stringify(envelope.data);
        if (checksum(serialised) !== envelope.checksum) {
          console.warn('[SaveManager] checksum mismatch — data was modified or truncated');
          analytics.track('save_integrity_failed', { key: SAVE.key });
          // Still try to use it: a mismatch means "do not trust", and
          // `validate` already treats every field as untrusted.
        }
        payload = envelope.data;
      }

      const migrated = migrate(isRecord(payload) ? payload : {});
      this.state.hydrate(validate(migrated, nowMs));
      return true;
    } catch (err) {
      console.warn('[SaveManager] corrupt save — restoring defaults', err);
      analytics.track('save_corrupt', { key: SAVE.key });
      this.state.hydrate(createDefaultSave(nowMs));
      return false;
    }
  }

  /** Queue a debounced write. Repeated calls collapse into one. */
  scheduleWrite(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** Write immediately. Called on `pause` and before anything irreversible. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Serialise writes so a `pause` flush cannot interleave with a debounced one.
    this.writing = this.writing.then(() => this.write());
    return this.writing;
  }

  private async write(): Promise<void> {
    try {
      // Bumped here, so it counts writes rather than mutations — a mini-game
      // round dirties the save a dozen times and produces exactly one write.
      this.state.bumpRev();
      const data = this.state.snapshot;
      const serialised = JSON.stringify(data);
      const envelope: SaveEnvelope = {
        v: SAVE.version,
        checksum: checksum(serialised),
        data: data as SaveData,
      };
      await this.store.set(SAVE.key, JSON.stringify(envelope));
      this.onWritten?.();
    } catch (err) {
      console.warn('[SaveManager] write failed', err);
      analytics.track('save_write_failed', {});
    }
  }

  async clear(): Promise<void> {
    await this.store.remove(SAVE.key);
  }
}

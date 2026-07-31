/** Shared data contracts. No behaviour, no numbers. */

export type StatKey = 'hunger' | 'energy' | 'fun' | 'clean';

export const STAT_KEYS: readonly StatKey[] = ['hunger', 'energy', 'fun', 'clean'];

/** All four stats, 0..100 (clamped to [STAT_MIN, STAT_MAX] in practice). */
export interface PetStats {
  hunger: number;
  energy: number;
  fun: number;
  clean: number;
}

export interface EquippedItems {
  hat: string | null;
  outfit: string | null;
  /**
   * The living-room rug. Not worn, kept here anyway — see `WearSlot`.
   *
   * Null means the one `buildHome` bakes in, which is why nothing had to be
   * migrated: every existing save reads null and gets the rug it already had.
   */
  decor: string | null;
}

/**
 * The persisted save. Spec §4.
 *
 * Fields beyond §4 (`dailyLoginDayKey`, `dailyLoginStreak`,
 * `notificationsSentToday`, `notificationDayKey`, `muted`, `musicMuted`) are required by §7
 * daily login and §14 notification capping. They are additive and default-safe,
 * so they ship inside version 1 rather than forcing a migration on day one.
 */
export interface SaveData {
  version: number;

  /**
   * Who is playing, and what they called the cat. Both are asked for once, on
   * the first run, and both are required — a save with a name on it is a save
   * somebody feels ownership of, which is the whole reason it is worth not
   * losing.
   *
   * Empty means "never asked", which is what the first-run prompt keys off. A
   * save written before this existed therefore gets asked once, on next launch,
   * rather than being silently christened.
   */
  playerName: string;
  petName: string;

  /**
   * Monotonic write counter, used by the sync server to decide which of two
   * copies of a save is newer.
   *
   * NOT a timestamp. Two devices whose clocks disagree — and phone clocks do —
   * would resolve "newest" by whichever is set further ahead, so a device with
   * a fast clock would permanently win and eat the other's progress. A counter
   * only ever moves one way and only when this device actually wrote something.
   */
  rev: number;

  stats: PetStats;
  coins: number;
  gems: number;
  level: number;
  xp: number;
  ownedItems: string[];
  equipped: EquippedItems;
  isSleeping: boolean;
  /** ms epoch — drives offline catch-up. */
  lastSeenUtc: number;
  sleepStartedUtc: number | null;
  adWatchesToday: number;
  /** 'YYYY-MM-DD' in device-local time. */
  adDayKey: string;
  totalPlaySeconds: number;

  dailyLoginDayKey: string;
  dailyLoginStreak: number;
  notificationsSentToday: number;
  notificationDayKey: string;
  /**
   * Device-local day of the last shared photo, or '' for never.
   *
   * A day KEY rather than a counter or a timestamp, for the same reason the ad
   * cap is one: the bonus is "once a day", and a device-local date string is
   * the only form of that a player cannot farm by changing the clock forwards
   * and back — a mismatched key pays once and then matches.
   */
  photoDayKey: string;
  /**
   * Lifetime counts per trigger, for `AWARDS`. Keyed by `TaskTrigger`.
   *
   * A loose record rather than a total one over the union: a save written by a
   * build that knew a trigger this build does not must load, and a total
   * record would make removing a trigger a migration.
   */
  lifetime: Record<string, number>;
  awardsClaimed: string[];
  muted: boolean;
  /** Music has its own switch: plenty of players want the cues but not the loop. */
  musicMuted: boolean;

  /** 'YYYY-MM-DD' the current task set was drawn for; a new day redraws it. */
  taskDayKey: string;
  /**
   * The ids drawn for `taskDayKey`, stored rather than recomputed.
   *
   * The draw used to be a pure function of the day key over the live pool,
   * which quietly meant the pool was part of the key: adding one task shifted
   * every index, so a player who levelled past a gated task — or simply
   * updated the app — had that day's set swapped underneath them, taking any
   * unclaimed progress with it. Persisting the draw makes the day's promise
   * survive both.
   */
  taskIds: string[];
  /** Task id -> times done today. Absent means zero. */
  taskCounts: Record<string, number>;
  /** Task ids whose reward has been taken, so it cannot be taken twice. */
  taskClaimed: string[];
  /**
   * How far through the first-run tutorial the player is. -1 once finished or
   * skipped, and it never runs again — a tutorial that reappears is a bug the
   * player cannot escape.
   */
  tutorialStep: number;

  /**
   * How badly she needs the litter tray, 100 (comfortable) down to 0.
   *
   * Deliberately NOT a fifth entry in `PetStats` — see the note on `RELIEF` in
   * `tuning.ts`. Keeping it out is what stops it turning "get every meter
   * above 80" into a chore the player cannot see they owe, and what stops the
   * return card greeting an absence with "toilet -88".
   */
  relief: number;
  /**
   * Where the accident happened, or null. One mess at a time, deliberately.
   *
   * 'play' is a launcher rather than a room she stands in, so it is never a
   * legal value here; `SaveManager.validate` rejects it.
   */
  messRoom: RoomKey | null;
}

/** What changed while the player was away — feeds the return card (§6). */
export interface OfflineReport {
  elapsedHours: number;
  /** Elapsed time actually simulated, after the 18h cap. */
  appliedHours: number;
  capped: boolean;
  /** Device clock moved backwards; zero decay was applied. */
  clockWentBackwards: boolean;
  /** Elapsed time exceeded the manipulation threshold. */
  suspiciousJump: boolean;
  before: PetStats;
  after: PetStats;
  /** Per-stat delta, negative for decay. */
  deltas: PetStats;
  wokeUp: boolean;
  reliefBefore: number;
  reliefAfter: number;
  /**
   * She could not hold it while the player was away.
   *
   * Reported as a FACT rather than as a number. A signed delta next to
   * `hunger -57` would re-teach the player that this is a meter after all,
   * which is the one thing the design is trying not to say.
   */
  accident: boolean;
}

export type MoodName = 'neutral' | 'joy' | 'sad' | 'sleep' | 'talk' | 'eat' | 'angry';

/**
 * A bottom-bar tab. Not all of them are rooms.
 *
 * `play` and `style` are destinations the bar can send you to that have no
 * room layer behind them — one opens the mini-game, the other the wardrobe —
 * so anything that maps a key to scenery has to exclude them. `RoomBuilder`
 * does, at the type level, which is why adding one here surfaces every place
 * that assumed the two sets were the same.
 */
export type RoomKey = 'home' | 'kitchen' | 'bath' | 'bed' | 'loo' | 'play' | 'style';

/** Reasons threaded through Economy into Analytics — spec §7. */
export type SpendReason = 'food' | 'hat' | 'outfit' | 'decor' | 'minigame-retry';
export type EarnSource =
  | 'minigame'
  | 'rewarded-ad'
  | 'daily-login'
  | 'iap'
  | 'level-up'
  | 'task'
  | 'photo'
  | 'award'
  | 'debug';

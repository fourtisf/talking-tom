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
  muted: boolean;
  /** Music has its own switch: plenty of players want the cues but not the loop. */
  musicMuted: boolean;
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
}

export type MoodName = 'neutral' | 'joy' | 'sad' | 'sleep' | 'talk' | 'eat';

export type RoomKey = 'home' | 'kitchen' | 'bath' | 'bed' | 'play';

/** Reasons threaded through Economy into Analytics — spec §7. */
export type SpendReason = 'food' | 'hat' | 'outfit' | 'minigame-retry';
export type EarnSource =
  | 'minigame'
  | 'rewarded-ad'
  | 'daily-login'
  | 'iap'
  | 'level-up'
  | 'debug';

/**
 * ALL balance numbers live here. Single source of truth.
 *
 * Rule (spec §3): if a balance number appears in a scene, system or UI file,
 * that is a bug. The `no-magic-numbers`-style lint rule in `eslint.config.js`
 * guards the currency path; this file guards everyone's sanity.
 *
 * These are PRODUCTION values, not the prototype's demo tuning. The prototype
 * decays on a 1.4s tick so the loop is visible in a 60-second demo; the values
 * below are per-hour and roughly 2000x slower.
 */

import type { StatKey } from '@/core/types';

/* ------------------------------------------------------------------ *
 * Stats — spec §5
 * ------------------------------------------------------------------ */

export const STAT_MIN = 5 as const; // hard floor: a pet that reads as dead drives uninstalls
export const STAT_MAX = 100 as const;

/** Per-hour decay, applied continuously (interpolated), never in discrete ticks. */
export const STAT_DECAY_PER_HOUR: Readonly<Record<StatKey, number>> = {
  hunger: 12.5, // full -> empty in 8h
  energy: 10.0, // 10h
  fun: 16.7, // 6h — fastest on purpose; it is the stat that pulls players back
  clean: 7.1, // 14h
};

/** Meter turns "low" and pulses below this. */
export const STAT_WARN_BELOW: Readonly<Record<StatKey, number>> = {
  hunger: 30,
  energy: 25,
  fun: 35,
  clean: 30,
};

/** A local notification is scheduled for the moment a stat crosses this. */
export const STAT_NOTIFY_BELOW: Readonly<Record<StatKey, number>> = {
  hunger: 25,
  energy: 20,
  fun: 30,
  clean: 25,
};

/** Sleep — spec §5. Energy 0 -> 100 in 4h. */
export const SLEEP = {
  energyRegenPerHour: 25,
  /** Hunger still decays while asleep, at this fraction of the waking rate. */
  hungerDecayMultiplier: 0.4,
  /** Fun and clean do not decay while asleep. */
  funDecayMultiplier: 0,
  cleanDecayMultiplier: 0,
  /** Auto-wake once energy reaches this. */
  autoWakeAt: 100,
} as const;

/* ------------------------------------------------------------------ *
 * Offline progression — spec §6
 * ------------------------------------------------------------------ */

export const OFFLINE = {
  /** Retention decision, not a rounding convenience. */
  capHours: 18,
  /**
   * Beyond this, the elapsed time is almost certainly clock manipulation.
   * It is still treated as `capHours` of decay — never more, never a bonus.
   */
  clockManipulationThresholdHours: 24 * 30,
  /** Show the return card only if the player was away longer than this. */
  returnCardMinHours: 1,
} as const;

export const MS_PER_HOUR = 3_600_000 as const;

/* ------------------------------------------------------------------ *
 * Economy — spec §7
 * ------------------------------------------------------------------ */

export interface FoodDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly hunger: number;
  readonly fun?: number;
}

export const FOODS: readonly FoodDef[] = [
  { id: 'fish', name: 'Fish', cost: 0, hunger: 14 },
  { id: 'milk', name: 'Milk', cost: 10, hunger: 20 },
  { id: 'steak', name: 'Steak', cost: 30, hunger: 38 },
  { id: 'cake', name: 'Cake', cost: 60, hunger: 52, fun: 12 },
] as const;

/** Every feed costs a little cleanliness. */
export const FEED_CLEAN_PENALTY = 4 as const;

/** Bath: one scrub tap. */
export const SCRUB_CLEAN_GAIN = 11 as const;

/** Home: one head pat. */
export const PET_FUN_GAIN = 3 as const;

/** Home: a completed voice-mimic playback. */
export const VOICE_FUN_GAIN = 6 as const;

export interface HatDef {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  /** Level at which the hat becomes purchasable — spec §8. */
  readonly unlockLevel: number;
}

export const HATS: readonly HatDef[] = [
  { id: 'bloom', name: 'Bloom', price: 90, unlockLevel: 1 },
  { id: 'beanie', name: 'Beanie', price: 120, unlockLevel: 2 },
  { id: 'party', name: 'Party', price: 200, unlockLevel: 4 },
  { id: 'chef', name: 'Chef', price: 350, unlockLevel: 6 },
  { id: 'cans', name: 'Headset', price: 450, unlockLevel: 9 },
  { id: 'crown', name: 'Crown', price: 600, unlockLevel: 12 },
] as const;

export const EARN = {
  /** Mini-game: per successful catch. */
  miniGameCoinsPerCatch: 12,
  /** Rewarded video. */
  rewardedAdCoins: 150,
  rewardedAdsPerDay: 10,
  /** Level up. */
  gemsPerLevel: 2,
  /** Daily login, day 1 -> day 7. Day 7+ stays at the last value. */
  dailyLoginCoins: [50, 75, 110, 150, 200, 250, 300],
} as const;

export const STARTING = {
  coins: 500,
  gems: 8,
  level: 1,
  xp: 0,
  stats: { hunger: 62, energy: 74, fun: 48, clean: 70 },
} as const;

/* ------------------------------------------------------------------ *
 * Progression — spec §8
 * ------------------------------------------------------------------ */

export const XP_CURVE = {
  base: 80,
  exponent: 1.35,
} as const;

export const XP_AWARDS = {
  feed: 9,
  scrub: 4,
  pet: 2,
  voiceMimic: 6,
  buyItem: 20,
  miniGameCatch: 3,
} as const;

/** Content gates — spec §8. */
export const UNLOCK_LEVEL = {
  secondMiniGame: 5,
  bedroomDecor: 8,
  /** No ads and no IAP before this level — spec §13. */
  monetisation: 3,
} as const;

/* ------------------------------------------------------------------ *
 * Mini-game — spec §7 / §9
 * ------------------------------------------------------------------ */

export const MINIGAME = {
  durationSeconds: 20,
  spawnIntervalMs: 430,
  /** Chance a spawned item is junk (a sock) rather than a fish. */
  junkChance: 0.17,
  junkScorePenalty: 3,
  fallDurationMsMin: 2100,
  fallDurationMsMax: 3400,
  /** Fun awarded is `catches * funPerCatch`, capped. */
  funPerCatch: 2,
  funCap: 40,
  /** A round is tiring. */
  energyCost: 8,
} as const;

/* ------------------------------------------------------------------ *
 * Pet rig + idle director — spec §10
 * ------------------------------------------------------------------ */

export const ANIM = {
  breatheMs: 3600,
  breatheScaleY: 1.02,
  blinkEveryMsMin: 4200,
  blinkEveryMsMax: 6200,
  blinkMs: 120,
  squashMs: 440,
  hopMs: 620,
  eatMs: 1300,
  stretchMs: 1500,
  yawnMs: 1600,
  tailWagCycles: 5,
  tailWagCycleMs: 340,
  earPerkCycles: 3,
  earPerkCycleMs: 400,
  gazeOffsetPx: 7,
  gazeUpOffsetPx: 6,
  gazeMs: 1400,
  /** Slower breathing while asleep. */
  sleepBreatheMs: 5400,
} as const;

export const IDLE = {
  minDelayMs: 2600,
  maxDelayMs: 5800,
  /** After this long without a touch, weight the pool toward attention-seeking. */
  boredomAfterMs: 12_000,
  /** Extra copies of the attention-seeking idles pushed into the pool when bored. */
  boredomWeight: 1,
} as const;

/** Mood thresholds — resolved from the LOWEST stat. */
export const MOOD = {
  sadBelow: 28,
  joyAbove: 72,
} as const;

/* ------------------------------------------------------------------ *
 * Voice mimic — spec §9
 * ------------------------------------------------------------------ */

export const VOICE = {
  recordMsMin: 2500,
  recordMsMax: 3000,
  playbackRate: 1.6,
  /** Mouth opening is driven by playback amplitude, mapped through this range. */
  mouthAmplitudeFloor: 0.15,
  mouthAmplitudeCeil: 1.0,
  /** FFT smoothing for the amplitude follower. */
  analyserSmoothing: 0.55,
  analyserFftSize: 512,
} as const;

/* ------------------------------------------------------------------ *
 * Audio — spec §11
 * ------------------------------------------------------------------ */

export const AUDIO = {
  masterVolume: 0.8,
  /** SFX are ducked to this while voice-mimic playback runs. */
  duckVolume: 0.15,
  duckFadeMs: 120,
} as const;

/* ------------------------------------------------------------------ *
 * Persistence — spec §12
 * ------------------------------------------------------------------ */

export const SAVE = {
  key: 'biskit.save.v1',
  /** Bump on schema change; SaveManager must migrate. */
  version: 1,
  /** Writes are debounced by this much, plus a forced write on `pause`. */
  debounceMs: 500,
} as const;

/* ------------------------------------------------------------------ *
 * Notifications — spec §14
 * ------------------------------------------------------------------ */

export const NOTIFICATIONS = {
  maxPerDay: 2,
  /** Never fire inside this device-local window. */
  quietStartHour: 22,
  quietEndHour: 8,
} as const;

/* ------------------------------------------------------------------ *
 * Ads and IAP — spec §13
 * ------------------------------------------------------------------ */

export const ADS = {
  /**
   * Rewarded video only for v1. No interstitials, no forced ads.
   *
   * `forcedFormatsEnabled` is what the "remove ads" entitlement actually
   * suppresses. It is false here because v1 ships none — which is also why
   * that SKU currently removes nothing. See the README before selling it.
   */
  rewardedOnly: true,
  forcedFormatsEnabled: false,
  dailyCap: EARN.rewardedAdsPerDay,
} as const;

/** Store SKUs and what they grant. Coin amounts are balance, so they live here. */
export interface CoinPackDef {
  readonly sku: string;
  readonly name: string;
  readonly coins: number;
  /** Display only — the store is authoritative on real pricing. */
  readonly displayPrice: string;
}

export const COIN_PACKS: readonly CoinPackDef[] = [
  { sku: 'biskit.coins.small', name: 'Pocketful', coins: 1_200, displayPrice: '$0.99' },
  { sku: 'biskit.coins.medium', name: 'Treat Jar', coins: 6_500, displayPrice: '$4.99' },
  { sku: 'biskit.coins.large', name: 'Toy Chest', coins: 15_000, displayPrice: '$9.99' },
] as const;

export const REMOVE_ADS_SKU = 'biskit.removeads' as const;

/**
 * Feature flags for the two §17 open questions that change shipped scope.
 * Both default OFF until the answers land — see README "Open questions".
 */
export const FEATURES = {
  /**
   * §17.4 — confirmed wanted, so the SKU is offered. Note that with
   * `ADS.forcedFormatsEnabled` false there is nothing for it to remove yet;
   * the entitlement is real and persists, it simply has no forced format to
   * suppress until one is added.
   */
  removeAdsIap: true,
} as const;

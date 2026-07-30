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

import type { RoomKey, StatKey } from '@/core/types';

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
export const MS_PER_DAY = 86_400_000 as const;

/* ------------------------------------------------------------------ *
 * Economy — spec §7
 * ------------------------------------------------------------------ */

export interface FoodDef {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly hunger: number;
  readonly fun?: number;
  /**
   * Level at which the food appears on the tray. Everything used to be
   * available at level 1, which meant the kitchen looked identical on day 60
   * and day 1 — one of the places the game stopped having anything new to show.
   */
  readonly unlockLevel: number;
}

export const FOODS: readonly FoodDef[] = [
  { id: 'fish', name: 'Fish', cost: 0, hunger: 14, unlockLevel: 1 },
  { id: 'milk', name: 'Milk', cost: 10, hunger: 20, unlockLevel: 1 },
  { id: 'steak', name: 'Steak', cost: 30, hunger: 38, unlockLevel: 2 },
  { id: 'cake', name: 'Cake', cost: 60, hunger: 52, fun: 12, unlockLevel: 4 },
  { id: 'sushi', name: 'Sushi', cost: 95, hunger: 64, fun: 8, unlockLevel: 6 },
  { id: 'feast', name: 'Feast', cost: 150, hunger: 82, fun: 18, unlockLevel: 9 },
] as const;

/**
 * Hand feeding.
 *
 * Tapping a tray tile used to add hunger instantly, which is a spreadsheet
 * wearing a cat costume: the most-repeated action in the game asked nothing of
 * the player and gave nothing back but a number. Food is now dragged to her
 * mouth, she opens it when it is close, and she takes it a bite at a time.
 */
export const FEEDING = {
  /** Bites per item. Three is enough to feel eaten, few enough not to be a chore. */
  bites: 3,
  /** She opens her mouth once food is within this of it, in design pixels. */
  openRadius: 120,
  /** Release inside this and she takes a bite; outside and the food goes back. */
  biteRadius: 78,
  /** Size of the dragged morsel. */
  size: 62,
  /** The morsel shrinks by this much per bite, so a third one looks like a third. */
  shrinkPerBite: 0.26,
  /** Crumbs thrown on each bite. */
  crumbs: 7,
  crumbMs: 520,
  /** How long the food takes to fly home when dropped somewhere silly. */
  returnMs: 260,
  /** Nudge upward as she leans in for the bite. */
  leanPx: 7,
  leanMs: 160,
} as const;

/** Every feed costs a little cleanliness. */
export const FEED_CLEAN_PENALTY = 4 as const;

/**
 * Bath time.
 *
 * A bath used to be a button that added 11 clean, which is a spreadsheet with a
 * duck on it. It is now a ritual with four tools and a mess to actually remove,
 * so the numbers here decide how long that takes. The target is fifteen to
 * twenty seconds of rubbing for a filthy cat — long enough to feel like you did
 * something, short enough to do twice a day without resenting it.
 *
 * NOTHING HERE CAN FAIL. Rinsing early ends the bath with whatever cleanliness
 * was actually earned; there is no lockout, no wasted soap and no way to get
 * a worse result than not bathing her at all.
 */
export const BATHING = {
  /** Below this, dirt starts to show on her — above it she looks fine. The
   *  number of smudges is the length of `DIRT_SPOTS`, not a number here: it is
   *  a table of positions, and a count that disagreed with it would silently
   *  drop the last one. */
  showDirtBelow: 72,
  /** How far a tool reaches from its own tip, in design pixels. */
  reach: 66,
  /** Finger travel that counts as one rub. Small enough that a slow, careful
   *  scrub still registers; large enough that a twitch is not a full bath. */
  rubPerTick: 26,
  /** Cleanliness per rub with the brush, and with the soap. */
  brushClean: 2.2,
  soapClean: 1.1,
  /** Rubs to lift one smudge, with the brush. */
  rubsPerSpot: 5,
  /**
   * How much of a rub the SOAP is worth against dirt.
   *
   * Not zero, and that is a fix rather than a flourish: lather goes on white
   * and so does the cat, so a player who soaps her all over before reaching for
   * the brush can no longer see what they are supposed to be scrubbing. Soap
   * lifting dirt slowly means that order still finishes the bath — it just
   * takes twice as long as using the right tool.
   */
  soapScrub: 0.5,
  /** Foam blobs a full lather is worth. */
  lather: 16,
  /** Rubs of the toothbrush for the minty-fresh bonus, and what it is worth. */
  toothRubs: 7,
  toothFun: 7,
  /** Cleanliness the finishing rinse tops her up by, on top of the rubbing. */
  rinseClean: 26,
  /** Water droplets per rinse pass, and how long each falls for. */
  drops: 9,
  dropMs: 620,
  /** Size the dragged tool is drawn at. */
  toolSize: 84,
  /** How long a tool takes to fly home when let go. */
  returnMs: 240,
} as const;

/** Home: one head pat. */
export const PET_FUN_GAIN = 3 as const;

/**
 * How much poking she will take.
 *
 * A pat is a tap with a pause around it, and it stays rewarding forever — it is
 * the free way to top `fun` up and nothing here may take that away. A smack is
 * a tap that lands while she is still reacting to the last one. Hammering is
 * the only input that annoys her, because hammering is the only input that
 * means it.
 *
 * NOTHING HERE REWARDS KEEPING IT UP. The only numbers that move are the ones
 * the player is trying to raise, and they move the wrong way. She flinches, she
 * sulks, she forgives on a timer whatever the player does — and there is no
 * damage, no injury and no escalation past sulking, because a game that makes
 * hitting an animal fun is not one worth shipping.
 */
export const TEMPER = {
  /** Taps further apart than this are a fresh start, whatever came before. */
  pokeWindowMs: 620,
  /**
   * Cooling time constant. Heat decays proportionally, which gives every
   * tapping RATE a ceiling — see the note in `temper.ts`. Between them these
   * three numbers say: five taps a second makes her cross, three a second earns
   * a flinch and no worse, two a second is affection forever.
   */
  coolTauMs: 1150,
  /** Heat at which she recoils, and at which she has had enough. */
  pokesToFlinch: 3,
  pokesToCross: 6,
  /** How long she stays cross, with no way for the player to extend it. */
  sulkMs: 9000,
  /** What it costs her. Fun only — the stat the player is trying to raise. */
  funLoss: 9,
} as const;

/** Home: a completed voice-mimic playback. */
export const VOICE_FUN_GAIN = 6 as const;

/**
 * Which pocket a price comes out of.
 *
 * Coins are earned by playing; gems only by levelling. Splitting the rack in
 * two is what finally gives gems somewhere to go — see the note on `EARN`.
 */
export type Currency = 'coins' | 'gems';

/** Which of her two wearable slots an item goes in. */
export type WearSlot = 'hat' | 'outfit';

export interface WearableDef {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly currency: Currency;
  /** Level at which the item becomes purchasable — spec §8. */
  readonly unlockLevel: number;
  readonly slot: WearSlot;
}

/** The old name. Kept so nothing that only deals in hats has to change. */
export type HatDef = WearableDef;

/**
 * Two racks, deliberately.
 *
 * The coin rack is the one you shop from — it is paced against mini-game and
 * task income. The gem rack is the one you *arrive at*: gems come only from
 * levelling, so a gem hat is a level made visible, and every level-up is
 * progress toward one whether or not that level also unlocked something named.
 * That is what fixed the reward cadence; the curve change alone could not.
 */
export const HATS: readonly WearableDef[] = [
  { id: 'bloom', name: 'Bloom', price: 90, currency: 'coins', unlockLevel: 1, slot: 'hat' },
  { id: 'beanie', name: 'Beanie', price: 120, currency: 'coins', unlockLevel: 2, slot: 'hat' },
  { id: 'party', name: 'Party', price: 200, currency: 'coins', unlockLevel: 3, slot: 'hat' },
  { id: 'halo', name: 'Halo', price: 8, currency: 'gems', unlockLevel: 4, slot: 'hat' },
  { id: 'chef', name: 'Chef', price: 350, currency: 'coins', unlockLevel: 5, slot: 'hat' },
  { id: 'cans', name: 'Headset', price: 450, currency: 'coins', unlockLevel: 7, slot: 'hat' },
  { id: 'wizard', name: 'Wizard', price: 14, currency: 'gems', unlockLevel: 8, slot: 'hat' },
  { id: 'crown', name: 'Crown', price: 600, currency: 'coins', unlockLevel: 10, slot: 'hat' },
  { id: 'astro', name: 'Astro', price: 20, currency: 'gems', unlockLevel: 13, slot: 'hat' },
  { id: 'rainbow', name: 'Rainbow', price: 28, currency: 'gems', unlockLevel: 17, slot: 'hat' },
] as const;

/**
 * Clothes.
 *
 * `SaveData.equipped` has held an `outfit` field and `SpendReason` an 'outfit'
 * entry since the save format was written, and neither has ever been used —
 * the slot was designed and never filled. These fill it.
 *
 * Priced against the hats deliberately: an outfit covers more of her than a hat
 * does and changes her silhouette, so the cheapest one is still dearer than the
 * cheapest hat, and the rack tops out below the crown so hats stay the
 * long-game prize.
 */
export const OUTFITS: readonly WearableDef[] = [
  { id: 'tee', name: 'Tee', price: 140, currency: 'coins', unlockLevel: 1, slot: 'outfit' },
  { id: 'dungarees', name: 'Dungarees', price: 260, currency: 'coins', unlockLevel: 3, slot: 'outfit' },
  { id: 'hoodie', name: 'Hoodie', price: 380, currency: 'coins', unlockLevel: 5, slot: 'outfit' },
  { id: 'tutu', name: 'Tutu', price: 12, currency: 'gems', unlockLevel: 6, slot: 'outfit' },
  { id: 'raincoat', name: 'Raincoat', price: 520, currency: 'coins', unlockLevel: 9, slot: 'outfit' },
  { id: 'space', name: 'Space Suit', price: 24, currency: 'gems', unlockLevel: 14, slot: 'outfit' },
] as const;

/** Everything buyable from the wardrobe, in one list. */
export const WEARABLES: readonly WearableDef[] = [...HATS, ...OUTFITS];

export const EARN = {
  /** Mini-game: per successful catch. */
  miniGameCoinsPerCatch: 12,
  /** Rewarded video. */
  rewardedAdCoins: 150,
  rewardedAdsPerDay: 10,
  /**
   * Level up. Raised from 2 once gems had somewhere to go: at 2 a gem hat was
   * so far away that the currency still read as decorative, which is the
   * problem the sink was added to solve.
   */
  gemsPerLevel: 3,
  /** Daily login, day 1 -> day 7. Day 7+ stays at the last value. */
  dailyLoginCoins: [50, 75, 110, 150, 200, 250, 300],
  /** Reaching the end of the weekly streak also pays the levelling currency. */
  dailyLoginGemsOnStreakDay: 5,
  /** Which streak day pays those gems. */
  dailyLoginGemStreakDay: 7,
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

/**
 * `xpForLevel(n)` is the cost of levelling *out of* n, so the whole curve is
 * `base * n^exponent`.
 *
 * WHY THIS CHANGED. At 80^1.35 the six hats landed on days 0, 1, 4, 12, 33 and
 * 68 for an ACTIVE player (~155 XP/day: three daily tasks plus normal play).
 * The gaps ran +1, +4, +8, +21, +35 — so after the second week a player went
 * three weeks with nothing new, and a casual player roughly doubled every one
 * of those numbers. A power curve compounds, so the tail was always going to
 * open up; the old one just did it inside the first month.
 *
 * At 60^1.15 the same player reaches L11 around day 28 with a worst gap of
 * ~5.5 days, and every level pays gems that now buy something. Level 20 is
 * ~107 days rather than ~236, which is a horizon rather than an asymptote.
 *
 * If you change these, re-derive the schedule — do not adjust by feel. The
 * assertion in tests/progression.test.ts pins the shape on purpose.
 */
export const XP_CURVE = {
  base: 60,
  exponent: 1.15,
} as const;

export const XP_AWARDS = {
  feed: 9,
  scrub: 4,
  pet: 2,
  voiceMimic: 6,
  buyItem: 20,
  miniGameCatch: 3,
  /** Per correct step recalled in Copycat — see MINIGAME_COPYCAT. */
  miniGameCopycat: 4,
} as const;

/**
 * Content gates — spec §8.
 *
 * A gate here is a PROMISE, so it only belongs here once something is behind
 * it. `bedroomDecor: 8` used to sit in this block with nothing on the other
 * side and no reference outside its own test — a player reaching level 8 was
 * promised a thing that did not exist. It has been removed rather than left as
 * an aspiration; add it back the same day the decor does.
 */
export const UNLOCK_LEVEL = {
  secondMiniGame: 5,
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

/**
 * Copycat — the second mini-game, gated behind UNLOCK_LEVEL.secondMiniGame.
 *
 * Deliberately NOT another reflex game. Catch is "hit the moving thing"; a
 * reskin of it would have been a second thing to be bored of rather than a
 * second thing to do. Copycat is memory: Biskit taps a sequence of pads and
 * you play it back, one step longer each round. It also inverts the hook the
 * whole game is sold on — she repeats you everywhere else, so here you repeat
 * her — and it needs no instructions, which matters when the tutorial has
 * already spent the player's patience.
 */
export const MINIGAME_COPYCAT = {
  padCount: 4,
  /** Sequence length in round 1; one more each round. */
  startLength: 3,
  /** Round cap, so a very good player still reaches an ending. */
  maxRounds: 8,
  /** Playback: how long a pad stays lit, and the beat between lights. */
  litMs: 380,
  gapMs: 190,
  /** Pause before Biskit starts a sequence, so the player can settle. */
  leadInMs: 700,
  /** How long the player has to enter each step before the round is lost. */
  stepTimeoutMs: 3500,
  /** Coins per correctly recalled step. */
  coinsPerStep: 9,
  /** Fun per correctly recalled step, and the ceiling on a whole session. */
  funPerStep: 3,
  funCap: 40,
  /** Cheaper than Catch: this one is played sitting still. */
  energyCost: 5,
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
  /** The recoil when she is poked too hard: a snap back, then a shudder. */
  flinchMs: 520,
  /** How far her ears flatten back when she flinches. */
  flinchEarDeg: 26,
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
  /**
   * Gain for a bare pitch played through `audio.tone()`. Copycat's pads are
   * the only caller: they need four notes that are not fixed cues, because on
   * that board the sound IS the content rather than a garnish on an action.
   */
  toneGain: 0.16,
  /** SFX are ducked to this while voice-mimic playback runs. */
  duckVolume: 0.15,
  duckFadeMs: 120,
} as const;

/**
 * Background music. Synthesised like the SFX, so it costs no download and no
 * licence — see `core/Music.ts` for the loop itself.
 *
 * It sits deliberately far under the SFX: a pet game is played for long
 * stretches, and music you notice is music you mute.
 */
export const MUSIC = {
  bpm: 96,
  volume: 0.16,
  /** Pulled down to this under voice-mimic playback, same as the SFX bus. */
  duckVolume: 0.03,
  /** Mute and unmute fade over this rather than cutting. */
  fadeMs: 420,
  /** Notes are queued this far ahead of the clock; timers are not sample-accurate. */
  lookaheadMs: 220,
  schedulerIntervalMs: 90,
} as const;

/* ------------------------------------------------------------------ *
 * Daily tasks
 * ------------------------------------------------------------------ *
 *
 * A pet game with no stated goal reads as a toy: the player pokes it, nothing
 * asks anything of them, and they leave. These are the asks. Three a day, drawn
 * from the pool below, each naming one concrete thing to do and paying coins
 * and XP for it — so "how do I level up" has an answer on screen rather than in
 * a wiki.
 *
 * `trigger` is an XP reason (see XP_AWARDS) that Progression already emits for
 * every action, plus two derived ones the Tasks system computes:
 *   'allStatsHigh' — every meter at or above ALL_STATS_TARGET
 *   'sleep'        — put the pet to bed
 */

export type TaskTrigger =
  | 'feed'
  | 'scrub'
  | 'pet'
  | 'voiceMimic'
  | 'buyItem'
  | 'miniGameCatch'
  | 'miniGameCopycat'
  | 'sleep'
  | 'allStatsHigh';

export interface TaskDef {
  readonly id: string;
  readonly trigger: TaskTrigger;
  /** How many times, or 1 for a do-it-once task. */
  readonly target: number;
  /** Imperative and specific. The player should never have to guess where. */
  readonly label: string;
  /** Which room the task lives in, so the sheet can send the player there. */
  readonly room: RoomKey | 'shop';
  readonly coins: number;
  readonly xp: number;
  /**
   * Only drawn once the player has reached this level. Without it a level-3
   * player can be handed "play Copycat", which is behind level 5 — a daily task
   * pointing at a locked door is worse than no task at all.
   */
  readonly minLevel?: number;
}

export const TASKS = {
  /** Drawn per day from the pool. Three is enough to guide, few enough to finish. */
  perDay: 3,
  /** The bar every meter must reach for the `allStatsHigh` task. */
  allStatsTarget: 80,
  pool: [
    { id: 'feed3', trigger: 'feed', target: 3, label: 'Feed Biskit 3 times', room: 'kitchen', coins: 60, xp: 18 },
    { id: 'scrub2', trigger: 'scrub', target: 2, label: 'Give Biskit 2 baths', room: 'bath', coins: 50, xp: 14 },
    { id: 'pet10', trigger: 'pet', target: 10, label: 'Pet Biskit 10 times', room: 'home', coins: 40, xp: 12 },
    { id: 'voice1', trigger: 'voiceMimic', target: 1, label: 'Make Biskit repeat you', room: 'home', coins: 70, xp: 20 },
    { id: 'catch8', trigger: 'miniGameCatch', target: 8, label: 'Catch 8 treats in Play', room: 'play', coins: 80, xp: 22 },
    { id: 'sleep1', trigger: 'sleep', target: 1, label: 'Tuck Biskit into bed', room: 'bed', coins: 40, xp: 10 },
    { id: 'happy', trigger: 'allStatsHigh', target: 1, label: 'Get every meter above 80', room: 'home', coins: 90, xp: 26 },
    { id: 'buy1', trigger: 'buyItem', target: 1, label: 'Buy a hat in the shop', room: 'shop', coins: 50, xp: 24 },
    { id: 'copy5', trigger: 'miniGameCopycat', target: 5, label: 'Copy 5 steps in Copycat', room: 'play', coins: 85, xp: 24, minLevel: UNLOCK_LEVEL.secondMiniGame },
  ] as readonly TaskDef[],
} as const;

/* ------------------------------------------------------------------ *
 * Tutorial
 * ------------------------------------------------------------------ */

export const TUTORIAL = {
  /** Pause before the first card, so the room has drawn and settled. */
  startDelayMs: 700,
  /** How long the spotlight ring takes to travel between steps. */
  moveMs: 320,
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

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ *
 *
 * Diagnostics are not gameplay, but every number below is a cost the player
 * pays — storage writes, battery — so they sit here with the rest of the dials
 * rather than buried inside the service.
 */

export const ANALYTICS = {
  /**
   * Its own storage keys, deliberately not inside SaveData. Diagnostics have to
   * be wipeable without touching a level 14 pet, and a counter map must never
   * be able to force a save migration.
   */
  funnelKey: 'biskit.analytics.funnel.v1',
  logKey: 'biskit.analytics.log.v1',
  /** Rolling event log bounds. Whichever is hit first wins. */
  logMaxEntries: 120,
  logMaxBytes: 24_000,
  /** Writes are debounced: a mini-game round can emit a dozen events a second. */
  writeDebounceMs: 4000,
  /** Taps on the version label that open the diagnostics sheet. */
  debugTapCount: 7,
  /** Taps must land within this of each other, or the count resets. */
  debugTapWindowMs: 3000,
} as const;

/* ------------------------------------------------------------------ *
 * Save sync
 * ------------------------------------------------------------------ */

export const SYNC = {
  /**
   * Same origin, proxied by nginx to the local sync process. Relative on
   * purpose: an absolute host would be wrong inside the Capacitor bundle, and
   * would also turn every save into a cross-origin request for no gain.
   *
   * Empty disables sync completely, which is what a local `vite preview` and
   * every test get unless they opt in.
   */
  endpoint: '/api',
  /**
   * Its own storage key, deliberately NOT inside SaveData. Importing somebody
   * else's backup code should adopt their pet and their token together, but a
   * save reset locally must not lose the identity the server knows it by.
   */
  tokenKey: 'biskit.sync.token.v1',
  /**
   * A stalled connection on a captive portal otherwise hangs for the platform
   * default, which on some webviews is minutes — and boot waits on the pull.
   */
  timeoutMs: 6000,
  /** Pushes are debounced: a mini-game round can dirty the save many times. */
  pushDebounceMs: 8000,
} as const;

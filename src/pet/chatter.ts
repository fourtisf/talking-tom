/**
 * What she has to say, and — mostly — when to keep quiet.
 *
 * The landing page promises "come back tomorrow and she will have opinions
 * about it". What the game had was `yum`, `purr` and a sheet of numbers on
 * return, which is a report rather than an opinion. This picks a line.
 *
 * THE HARD PART IS THE SILENCE, not the lines. A pet that comments on
 * everything is a pet you mute — and there is no mute for this, so the
 * restraint has to be built in. Three rules do it:
 *
 *   1. An occasion has to EARN a line. Most taps produce nothing.
 *   2. A cooldown per occasion, and a floor between any two lines at all, so
 *      three things happening at once produce one remark instead of three.
 *   3. No line twice in a row from the same pool, because the second time you
 *      see a repeat is the moment the character stops being a character.
 *
 * Phaser-free, and the whole point of that here: "does she say the right thing
 * after eight hours away with a full hunger bar" is a question about a table,
 * and answering it in a browser costs a canvas and a wall clock.
 */

import type { PetStats, StatKey } from '@/core/types';

export type Occasion =
  | 'return'
  | 'idle'
  | 'dressed'
  | 'fed'
  | 'washed'
  | 'played'
  | 'woke';

/** Everything a line can be chosen from. No Phaser, no clock, no state object. */
export interface ChatterInput {
  occasion: Occasion;
  stats: PetStats;
  /** Hours since the app was last open. Only meaningful for 'return'. */
  hoursAway: number;
  /** She is wearing something new this instant. Only for 'dressed'. */
  outfitName?: string | undefined;
  nowMs: number;
}

/**
 * Line pools, as message-key STEMS.
 *
 * A stem plus an index, rather than a list of keys, because the pools grow and
 * a translator wants `chat.hungry.1..4` sitting together in the catalogue
 * rather than scattered wherever they were added.
 */
export interface Pool {
  stem: string;
  count: number;
}

/**
 * What she notices, in the order she notices it.
 *
 * Ordered, not scored. A weighted pick across four needs produces a cat who
 * mentions her fun bar while she is starving, and the player — who can see all
 * four meters — reads that as the game not knowing its own state. The worst
 * thing wins, and only if it is actually bad.
 */
const NEED_ORDER: readonly StatKey[] = ['hunger', 'energy', 'clean', 'fun'];

const NEED_POOLS: Readonly<Record<StatKey, Pool>> = {
  hunger: { stem: 'chat.hungry', count: 4 },
  energy: { stem: 'chat.tired', count: 3 },
  clean: { stem: 'chat.dirty', count: 3 },
  fun: { stem: 'chat.bored', count: 4 },
};

const HAPPY: Pool = { stem: 'chat.happy', count: 5 };
const RETURN_SHORT: Pool = { stem: 'chat.back.short', count: 3 };
const RETURN_LONG: Pool = { stem: 'chat.back.long', count: 3 };
const RETURN_AGES: Pool = { stem: 'chat.back.ages', count: 3 };
const DRESSED: Pool = { stem: 'chat.dressed', count: 4 };
const FED: Pool = { stem: 'chat.fed', count: 3 };
const WASHED: Pool = { stem: 'chat.washed', count: 3 };
const PLAYED: Pool = { stem: 'chat.played', count: 3 };
const WOKE: Pool = { stem: 'chat.woke', count: 3 };

/**
 * Every pool there is, so a test can walk all of them.
 *
 * `count` and the number of `chat.*` keys in the catalogue are two
 * hand-maintained lists in different files and nothing else makes them agree.
 * A pool one over its catalogue shows the player a raw message key — and only
 * for one index in four, so it survives any amount of playing and turns up in
 * a screenshot instead. Exported for that check and nothing else.
 */
export const ALL_POOLS: readonly Pool[] = [
  ...Object.values(NEED_POOLS),
  HAPPY,
  RETURN_SHORT,
  RETURN_LONG,
  RETURN_AGES,
  DRESSED,
  FED,
  WASHED,
  PLAYED,
  WOKE,
];

/** Below this a need is worth mentioning. Above it she is fine and says so. */
export const CHATTER = {
  needBelow: 55,
  /** Per-occasion silence, ms. */
  cooldownMs: {
    return: 0,
    idle: 26_000,
    dressed: 2_500,
    fed: 9_000,
    washed: 9_000,
    played: 9_000,
    woke: 0,
  } as Readonly<Record<Occasion, number>>,
  /**
   * The floor between ANY two lines, whatever the occasion.
   *
   * Feeding her in the kitchen fires 'fed' and can tip 'idle' a beat later;
   * without this she says two things in three seconds and reads as buggy
   * rather than talkative.
   */
  floorMs: 4_000,
} as const;

export interface Line {
  /** `chat.hungry.2` — resolved by the caller against the catalogue. */
  key: string;
  /** Substitutions the line may use. */
  params: Record<string, string | number>;
}

/**
 * Which pool an occasion draws from, before cooldowns are considered.
 *
 * Returns null where she should say nothing at all: an idle beat with every
 * meter healthy is the common case and it is meant to be quiet more often than
 * not — the `HAPPY` pool exists for it, but only sometimes (see `pickLine`).
 */
export function poolFor(input: ChatterInput): Pool | null {
  switch (input.occasion) {
    case 'return':
      if (input.hoursAway >= 24) return RETURN_AGES;
      if (input.hoursAway >= 6) return RETURN_LONG;
      if (input.hoursAway >= 1) return RETURN_SHORT;
      return null;
    case 'dressed':
      return DRESSED;
    case 'fed':
      return FED;
    case 'washed':
      return WASHED;
    case 'played':
      return PLAYED;
    case 'woke':
      return WOKE;
    case 'idle': {
      const worst = worstNeed(input.stats);
      return worst ? NEED_POOLS[worst] : HAPPY;
    }
  }
}

/** The lowest stat that is actually low, or null if she is fine. */
export function worstNeed(stats: PetStats): StatKey | null {
  let worst: StatKey | null = null;
  for (const key of NEED_ORDER) {
    const v = stats[key];
    if (v >= CHATTER.needBelow) continue;
    if (worst === null || v < stats[worst]) worst = key;
  }
  return worst;
}

/**
 * The talking clock.
 *
 * Holds the last time each occasion spoke and the last index drawn from each
 * pool. A class rather than free functions because both of those are state
 * that has to survive between calls and neither belongs in the save — a cat
 * who remembers across a reinstall that she last said line 3 is not a feature.
 */
export class Chatter {
  private lastAt: Partial<Record<Occasion, number>> = {};
  private lastAny = Number.NEGATIVE_INFINITY;
  private lastIndex: Record<string, number> = {};
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Phaser reuses scene instances; a new run must not inherit old timings. */
  reset(): void {
    this.lastAt = {};
    this.lastAny = Number.NEGATIVE_INFINITY;
    this.lastIndex = {};
  }

  /**
   * A line, or null for silence. Silence is the common answer and is not a
   * failure — see the note at the top.
   */
  pick(input: ChatterInput): Line | null {
    const { occasion, nowMs } = input;
    if (nowMs - this.lastAny < CHATTER.floorMs) return null;
    const since = nowMs - (this.lastAt[occasion] ?? Number.NEGATIVE_INFINITY);
    if (since < CHATTER.cooldownMs[occasion]) return null;

    const pool = poolFor(input);
    if (!pool) return null;
    /*
     * An idle beat with a healthy cat speaks one time in three.
     *
     * She has nothing to report then, and a pet who announces that she is fine
     * every twenty-six seconds is more annoying than one who announces she is
     * hungry — the hungry one is at least telling you something.
     */
    if (pool === HAPPY && this.random() > 0.34) return null;

    const key = `${pool.stem}.${this.draw(pool)}`;
    this.lastAt[occasion] = nowMs;
    this.lastAny = nowMs;
    return { key, params: this.paramsFor(input) };
  }

  /** Never the same index twice running from one pool. */
  private draw(pool: Pool): number {
    const previous = this.lastIndex[pool.stem];
    let index = Math.floor(this.random() * pool.count);
    if (index >= pool.count) index = pool.count - 1;
    if (pool.count > 1 && index === previous) index = (index + 1) % pool.count;
    this.lastIndex[pool.stem] = index;
    return index + 1;
  }

  private paramsFor(input: ChatterInput): Record<string, string | number> {
    const params: Record<string, string | number> = {};
    if (input.occasion === 'return') params['hours'] = Math.max(1, Math.floor(input.hoursAway));
    if (input.outfitName) params['outfit'] = input.outfitName;
    return params;
  }
}

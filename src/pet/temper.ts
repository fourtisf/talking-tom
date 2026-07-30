/**
 * How much poking she will take before she has had enough.
 *
 * Phaser-free, like `idlePolicy` and `sleepPose`, so the rule that decides
 * whether a touch was affection or a smack can be unit-tested without a canvas.
 * It is a rule about timing, and timing rules are exactly the kind that look
 * right in a screenshot and are wrong in the hand.
 *
 * THE LINE THIS DRAWS. A pat is a tap with a pause around it and it stays
 * rewarding forever — that is the free, always-available way to top up `fun`,
 * and nothing here may take it away. A smack is a tap that lands while she is
 * still reacting to the last one. Hammering is the only input that annoys her,
 * because hammering is the only input that means it.
 *
 * SHE ALWAYS FORGIVES. Every path out of `cross` is time, and the timer runs
 * whether or not the player does anything. A pet you can put into a state and
 * not get out of is a broken pet, and a child who thinks they have permanently
 * ruined their cat closes the app.
 */

import { TEMPER } from '@/config/tuning';

export type Touch = 'pat' | 'flinch' | 'cross';

export interface Temper {
  /** Pokes credited in the current burst. Decays with silence. */
  readonly heat: number;
  /** When the last touch landed. */
  readonly lastMs: number;
  /** She stays cross until this. */
  readonly crossUntilMs: number;
}

export const CALM: Temper = { heat: 0, lastMs: 0, crossUntilMs: 0 };

export function isCross(temper: Temper, nowMs: number): boolean {
  return nowMs < temper.crossUntilMs;
}

/**
 * Heat left after `sinceMs` of being left alone.
 *
 * EXPONENTIAL, and it has to be. Subtracting a fixed amount per millisecond
 * looks simpler and is a trap: heat then grows without bound at any rate faster
 * than one poke per cooling period, so a player patting her briskly but
 * affectionately for twenty seconds crosses the same threshold as someone
 * hammering — the tests caught exactly that. Decay proportional to heat gives
 * every tapping rate a CEILING instead, and the thresholds are chosen against
 * those ceilings:
 *
 *   every 200ms (5/sec, hammering)      settles at 6.3  -> cross
 *   every 300ms (3/sec, agitated)       settles at 4.4  -> flinch, never cross
 *   every 500ms (2/sec, brisk and fond) settles at 2.8  -> pat, forever
 *
 * So the rule is about RATE, which is what "smacking" actually means, rather
 * than about how long the player has been enjoying themselves.
 */
function cooled(heat: number, sinceMs: number): number {
  return heat * Math.exp(-sinceMs / TEMPER.coolTauMs);
}

/**
 * Register a touch. Returns the new temper and what she should do about it.
 *
 * `pat`    — affection. The caller pays fun and plays a happy reaction.
 * `flinch` — she did not like that. No fun, a recoil, and a warning.
 * `cross`  — she has had enough. Fun comes OFF and she sulks.
 */
export function touch(temper: Temper, nowMs: number): { temper: Temper; reaction: Touch } {
  // Already sulking: further pokes neither help nor stack. They keep her cross
  // for the remaining time and nothing more, so there is no way to dig deeper.
  if (isCross(temper, nowMs)) {
    return {
      temper: { ...temper, lastMs: nowMs },
      reaction: 'cross',
    };
  }

  const gap = temper.lastMs === 0 ? Number.POSITIVE_INFINITY : nowMs - temper.lastMs;
  // A touch that lands after she has finished reacting is a fresh pat, however
  // many came before it. This touch always counts as one.
  const heat = (gap >= TEMPER.pokeWindowMs ? 0 : cooled(temper.heat, gap)) + 1;

  if (heat >= TEMPER.pokesToCross) {
    return {
      temper: { heat: 0, lastMs: nowMs, crossUntilMs: nowMs + TEMPER.sulkMs },
      reaction: 'cross',
    };
  }
  return {
    temper: { heat, lastMs: nowMs, crossUntilMs: 0 },
    reaction: heat >= TEMPER.pokesToFlinch ? 'flinch' : 'pat',
  };
}

/** Something kind happened. She lets it go early. */
export function forgive(temper: Temper): Temper {
  return { ...CALM, lastMs: temper.lastMs };
}

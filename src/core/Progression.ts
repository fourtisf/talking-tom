/**
 * XP, levels and unlocks. Spec §8.
 *
 * `xpForLevel(n)` is the cost of the level-up *from* level n, so the curve
 * reads: L1 80, L2 204, L3 353, L5 688, L10 1783, L20 4546.
 */

import { UNLOCK_LEVEL, XP_AWARDS, XP_CURVE } from '@/config/tuning';
import type { Economy } from '@/core/Economy';
import type { GameState } from '@/core/GameState';
import { EARN } from '@/config/tuning';
import { Emitter } from '@/core/EventBus';
import { analytics } from '@/services/Analytics';

export type XpReason = keyof typeof XP_AWARDS;

/**
 * Task rewards carry their own XP amount rather than a rate from `XP_AWARDS`,
 * so they are a source without a table entry. Kept distinct so `Tasks` can
 * ignore its own payouts instead of counting them as progress.
 */
export type XpSource = XpReason | 'task';

export interface ProgressionEvents {
  /**
   * `count` is how many times the thing happened, which is not derivable from
   * `amount` — the mini-game awards once for a whole round with the catch count
   * as its multiplier, and a task counting catches needs the count, not the XP.
   */
  xpGained: { amount: number; reason: XpSource; count: number; xp: number; xpNeeded: number };
  levelUp: { level: number; gemsAwarded: number };
}

export function xpForLevel(level: number): number {
  return Math.floor(XP_CURVE.base * Math.pow(level, XP_CURVE.exponent));
}

/** 0..1 progress through the current level, for the HUD bar. */
export function levelProgress(level: number, xp: number): number {
  const needed = xpForLevel(level);
  if (needed <= 0) return 0;
  return Math.min(1, xp / needed);
}

export class Progression {
  readonly events = new Emitter<ProgressionEvents>();

  private readonly state: GameState;
  private readonly economy: Economy;

  constructor(state: GameState, economy: Economy) {
    this.state = state;
    this.economy = economy;
  }

  award(reason: XpReason, multiplier = 1): void {
    this.awardFlat(Math.round(XP_AWARDS[reason] * multiplier), reason, multiplier);
  }

  /** For rewards that carry their own XP figure rather than a table rate. */
  awardFlat(amount: number, reason: XpSource, count = 1): void {
    if (amount <= 0) return;

    let level = this.state.level;
    let xp = this.state.xp + amount;

    const levelUps: number[] = [];
    // `while`, not `if`: a mini-game payout can cross more than one level.
    while (xp >= xpForLevel(level)) {
      xp -= xpForLevel(level);
      level += 1;
      levelUps.push(level);
    }

    this.state.setProgress(level, xp);
    this.events.emit('xpGained', {
      amount,
      reason,
      count,
      xp,
      xpNeeded: xpForLevel(level),
    });

    for (const newLevel of levelUps) {
      this.economy.earnGems(EARN.gemsPerLevel, 'level-up');
      this.events.emit('levelUp', { level: newLevel, gemsAwarded: EARN.gemsPerLevel });
      analytics.track('level_up', { level: newLevel });
    }
  }

  /** Content gate helper — spec §8 / §13. */
  isUnlocked(gate: keyof typeof UNLOCK_LEVEL): boolean {
    return this.state.level >= UNLOCK_LEVEL[gate];
  }

  /** Hats carry their own unlock level (see `HATS` in tuning). */
  isLevelReached(level: number): boolean {
    return this.state.level >= level;
  }

  get xpNeeded(): number {
    return xpForLevel(this.state.level);
  }

  get progress(): number {
    return levelProgress(this.state.level, this.state.xp);
  }
}

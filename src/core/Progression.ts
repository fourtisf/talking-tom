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

export interface ProgressionEvents {
  xpGained: { amount: number; reason: XpReason; xp: number; xpNeeded: number };
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
    const amount = Math.round(XP_AWARDS[reason] * multiplier);
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

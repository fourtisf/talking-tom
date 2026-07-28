/**
 * The only money mutation path. Spec §7.
 *
 * Every coin and gem in the game enters and leaves through this object. No
 * scene, UI element or service touches `coins` directly — `GameState` refuses
 * the write without the capability token that only this file imports.
 *
 * `reason` / `source` are required and forwarded to Analytics: you cannot
 * balance an economy you cannot see.
 *
 * Isolation note (§7): a future token layer means implementing this one
 * interface differently. Nothing else needs to change.
 */

import { CURRENCY_MUTATION_KEY } from '@/core/currencyKey';
import type { GameState } from '@/core/GameState';
import type { EarnSource, SpendReason } from '@/core/types';
import { analytics } from '@/services/Analytics';
import { Emitter } from '@/core/EventBus';

export interface EconomyEvents {
  spent: { amount: number; reason: SpendReason; balance: number };
  earned: { amount: number; source: EarnSource; balance: number };
  denied: { amount: number; reason: SpendReason; balance: number };
  gems: { amount: number; source: EarnSource; balance: number };
}

export class Economy {
  readonly events = new Emitter<EconomyEvents>();

  private readonly state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  canAfford(cost: number): boolean {
    return this.state.coins >= cost;
  }

  /**
   * Attempt a purchase. Returns false and emits `denied` when short — the
   * caller plays the "no funds" sfx off that event rather than guessing.
   */
  spend(cost: number, reason: SpendReason): boolean {
    if (cost < 0) throw new Error(`Economy.spend: negative cost (${cost}) for "${reason}"`);
    if (cost === 0) return true;

    if (!this.canAfford(cost)) {
      this.events.emit('denied', { amount: cost, reason, balance: this.state.coins });
      analytics.track('currency_denied', {
        amount: cost,
        reason,
        balance: this.state.coins,
      });
      return false;
    }

    this.state.applyCurrency(CURRENCY_MUTATION_KEY, { coins: -cost });
    this.events.emit('spent', { amount: cost, reason, balance: this.state.coins });
    analytics.track('currency_spent', {
      amount: cost,
      reason,
      balance: this.state.coins,
    });
    return true;
  }

  earn(amount: number, source: EarnSource): void {
    if (amount < 0) throw new Error(`Economy.earn: negative amount (${amount}) from "${source}"`);
    if (amount === 0) return;

    this.state.applyCurrency(CURRENCY_MUTATION_KEY, { coins: amount });
    this.events.emit('earned', { amount, source, balance: this.state.coins });
    analytics.track('currency_earned', {
      amount,
      source,
      balance: this.state.coins,
    });
  }

  earnGems(amount: number, source: EarnSource): void {
    if (amount < 0) throw new Error(`Economy.earnGems: negative amount (${amount})`);
    if (amount === 0) return;

    this.state.applyCurrency(CURRENCY_MUTATION_KEY, { gems: amount });
    this.events.emit('gems', { amount, source, balance: this.state.gems });
    analytics.track('gems_earned', { amount, source, balance: this.state.gems });
  }

  canAffordGems(cost: number): boolean {
    return this.state.gems >= cost;
  }

  spendGems(cost: number, reason: SpendReason): boolean {
    if (cost < 0) throw new Error(`Economy.spendGems: negative cost (${cost})`);
    if (cost === 0) return true;
    if (!this.canAffordGems(cost)) {
      analytics.track('gems_denied', { amount: cost, reason, balance: this.state.gems });
      return false;
    }
    this.state.applyCurrency(CURRENCY_MUTATION_KEY, { gems: -cost });
    analytics.track('gems_spent', { amount: cost, reason, balance: this.state.gems });
    return true;
  }
}

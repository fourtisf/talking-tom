import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import { CURRENCY_MUTATION_KEY } from '@/core/currencyKey';
import { analytics } from '@/services/Analytics';

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

function setup(coins = 100, gems = 3) {
  const save = createDefaultSave(T0);
  save.coins = coins;
  save.gems = gems;
  const state = new GameState(save);
  return { state, economy: new Economy(state) };
}

describe('Economy (§7)', () => {
  beforeEach(() => {
    analytics.reset();
  });

  it('canAfford reflects the balance exactly', () => {
    const { economy } = setup(100);
    expect(economy.canAfford(0)).toBe(true);
    expect(economy.canAfford(100)).toBe(true);
    expect(economy.canAfford(101)).toBe(false);
  });

  it('spend deducts and reports success', () => {
    const { state, economy } = setup(100);
    expect(economy.spend(30, 'food')).toBe(true);
    expect(state.coins).toBe(70);
  });

  it('spend refuses when short, leaves the balance untouched, and emits denied', () => {
    const { state, economy } = setup(20);
    const denied = vi.fn();
    economy.events.on('denied', denied);

    expect(economy.spend(60, 'hat')).toBe(false);
    expect(state.coins).toBe(20);
    expect(denied).toHaveBeenCalledWith({ amount: 60, reason: 'hat', balance: 20 });
  });

  it('a free item costs nothing and always succeeds', () => {
    const { state, economy } = setup(0);
    expect(economy.spend(0, 'food')).toBe(true);
    expect(state.coins).toBe(0);
  });

  it('earn adds coins', () => {
    const { state, economy } = setup(100);
    economy.earn(150, 'rewarded-ad');
    expect(state.coins).toBe(250);
  });

  it('rejects negative amounts rather than silently inverting them', () => {
    const { economy } = setup(100);
    expect(() => economy.spend(-10, 'food')).toThrow();
    expect(() => economy.earn(-10, 'minigame')).toThrow();
    expect(() => economy.earnGems(-1, 'level-up')).toThrow();
  });

  it('forwards every reason and source to analytics (§7)', () => {
    const { economy } = setup(100);
    economy.spend(30, 'food');
    economy.earn(12, 'minigame');
    economy.spend(9999, 'hat');

    const events = analytics.recent().map((e) => [e.event, e.props['reason'] ?? e.props['source']]);
    expect(events).toContainEqual(['currency_spent', 'food']);
    expect(events).toContainEqual(['currency_earned', 'minigame']);
    expect(events).toContainEqual(['currency_denied', 'hat']);
  });

  it('handles gems on the same guarded path', () => {
    const { state, economy } = setup(0, 3);
    economy.earnGems(2, 'level-up');
    expect(state.gems).toBe(5);
    expect(economy.spendGems(10, 'hat')).toBe(false);
    expect(economy.spendGems(5, 'hat')).toBe(true);
    expect(state.gems).toBe(0);
  });
});

describe('currency isolation (§7 / §15)', () => {
  it('GameState refuses a currency write without the Economy token', () => {
    const { state } = setup(100);
    const forged: symbol = Symbol('not-economy');
    expect(() =>
      state.applyCurrency(forged as typeof CURRENCY_MUTATION_KEY, { coins: 1_000_000 }),
    ).toThrow(/may only be mutated by Economy/);
    expect(state.coins).toBe(100);
  });

  it('never lets a balance go negative even through the token', () => {
    const { state } = setup(10);
    state.applyCurrency(CURRENCY_MUTATION_KEY, { coins: -999 });
    expect(state.coins).toBe(0);
  });

  it('exposes coins as a read-only getter — there is no setter to call', () => {
    const { state } = setup(10);
    const descriptor = Object.getOwnPropertyDescriptor(GameState.prototype, 'coins');
    expect(descriptor?.get).toBeTypeOf('function');
    expect(descriptor?.set).toBeUndefined();
    expect(state.coins).toBe(10);
  });
});

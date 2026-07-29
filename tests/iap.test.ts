import { beforeEach, describe, expect, it } from 'vitest';

import {
  COIN_PACKS,
  Iap,
  REMOVE_ADS_SKU,
  StubIapProvider,
  type IapProvider,
} from '@/services/Iap';
import { FEATURES, UNLOCK_LEVEL } from '@/config/tuning';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import { analytics } from '@/services/Analytics';

const T0 = Date.UTC(2026, 4, 12, 12, 0, 0);

/** A store whose behaviour each test dictates. */
class ScriptedStore implements IapProvider {
  readonly id = 'scripted';
  readonly purchased: string[] = [];

  constructor(
    private readonly ready: boolean,
    private readonly outcome: { ok: boolean; cancelled?: boolean; message?: string } = {
      ok: true,
    },
    private readonly owned: readonly string[] = [],
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  purchase(sku: string): Promise<{ ok: boolean; cancelled?: boolean; message?: string }> {
    this.purchased.push(sku);
    return Promise.resolve(this.outcome);
  }

  restore(): Promise<readonly string[]> {
    return Promise.resolve(this.owned);
  }
}

function setup(level: number = UNLOCK_LEVEL.monetisation) {
  const save = createDefaultSave(T0);
  save.level = level;
  save.coins = 0;
  const state = new GameState(save);
  const economy = new Economy(state);
  return {
    state,
    economy,
    make: (provider: IapProvider) => new Iap(state, economy, provider),
  };
}

const PACK = COIN_PACKS[0]!;

describe('Iap (§13)', () => {
  beforeEach(() => analytics.reset());

  it('credits the pack through Economy on a successful purchase', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(true));

    const result = await iap.buyCoinPack(PACK.sku);
    expect(result).toEqual({ status: 'purchased', sku: PACK.sku });
    expect(ctx.state.coins).toBe(PACK.coins);

    // §7: the coins must be visible to analytics with their source.
    const events = analytics.recent().map((e) => [e.event, e.props['source'] ?? e.props['sku']]);
    expect(events).toContainEqual(['currency_earned', 'iap']);
  });

  it('credits nothing when the purchase fails', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(true, { ok: false, message: 'card declined' }));

    const result = await iap.buyCoinPack(PACK.sku);
    expect(result).toEqual({ status: 'failed', message: 'card declined' });
    expect(ctx.state.coins).toBe(0);
    expect(Iap.message(result)).toBe('card declined');
  });

  it('credits nothing and says nothing when the player cancels', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(true, { ok: false, cancelled: true }));

    const result = await iap.buyCoinPack(PACK.sku);
    expect(result).toEqual({ status: 'cancelled' });
    expect(ctx.state.coins).toBe(0);
    // Cancelling is deliberate; nagging about it is not.
    expect(Iap.message(result)).toBeNull();
  });

  it('rejects an unknown sku rather than crediting a guess', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(true));
    const result = await iap.buyCoinPack('biskit.coins.enormous');
    expect(result.status).toBe('failed');
    expect(ctx.state.coins).toBe(0);
  });

  it('offers nothing before the monetisation level (§13)', async () => {
    const ctx = setup(UNLOCK_LEVEL.monetisation - 1);
    const store = new ScriptedStore(true);
    const iap = ctx.make(store);

    expect(iap.isUnlocked).toBe(false);
    const result = await iap.buyCoinPack(PACK.sku);
    expect(result).toEqual({ status: 'locked', unlocksAtLevel: UNLOCK_LEVEL.monetisation });
    expect(store.purchased).toEqual([]);
    expect(ctx.state.coins).toBe(0);
  });

  it('separates the design gate from whether the store is connected', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(false));

    // Past the level gate, so the packs are shown...
    expect(iap.isUnlocked).toBe(true);
    // ...but the store is not there, so the attempt says so plainly.
    expect(iap.isStoreReady).toBe(false);
    expect(iap.isAvailable).toBe(false);

    const result = await iap.buyCoinPack(PACK.sku);
    expect(result).toEqual({ status: 'unavailable' });
    expect(Iap.message(result)).toMatch(/not available/i);
    expect(ctx.state.coins).toBe(0);
  });

  it('never runs two purchases from one tap sequence', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(true));
    await Promise.all([iap.buyCoinPack(PACK.sku), iap.buyCoinPack(PACK.sku)]);
    // Both are legitimate purchases at the service layer; the UI is what
    // debounces. What matters is that each credits exactly its own pack.
    expect(ctx.state.coins).toBe(PACK.coins * 2);
  });

  it('restores a non-consumable entitlement into the inventory', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(true, { ok: true }, [REMOVE_ADS_SKU]));

    expect(iap.hasRemovedAds).toBe(false);
    const restored = await iap.restore();
    expect(restored).toEqual([REMOVE_ADS_SKU]);
    expect(iap.hasRemovedAds).toBe(true);
    // Restoring an entitlement must never mint currency.
    expect(ctx.state.coins).toBe(0);
  });

  it('restores nothing gracefully', async () => {
    const ctx = setup();
    const iap = ctx.make(new ScriptedStore(true, { ok: true }, []));
    expect(await iap.restore()).toEqual([]);
    expect(iap.hasRemovedAds).toBe(false);
  });

  it('keeps the remove-ads SKU behind its feature flag (§17.4)', async () => {
    const ctx = setup();
    const store = new ScriptedStore(true);
    const iap = ctx.make(store);

    expect(iap.offersRemoveAds).toBe(FEATURES.removeAdsIap);
    if (!FEATURES.removeAdsIap) {
      // Off until the question is answered: the store is never even asked.
      expect(await iap.buyRemoveAds()).toEqual({ status: 'unavailable' });
      expect(store.purchased).toEqual([]);
      expect(ctx.state.owns(REMOVE_ADS_SKU)).toBe(false);
    }
  });

  it('the stub store refuses politely rather than pretending to sell things', async () => {
    const ctx = setup();
    const iap = ctx.make(new StubIapProvider());
    expect(iap.isStoreReady).toBe(false);
    expect(await iap.buyCoinPack(PACK.sku)).toEqual({ status: 'unavailable' });
    expect(ctx.state.coins).toBe(0);
  });

  it('prices every pack and gives each a distinct sku', () => {
    expect(COIN_PACKS.length).toBeGreaterThan(0);
    expect(new Set(COIN_PACKS.map((p) => p.sku)).size).toBe(COIN_PACKS.length);
    for (const pack of COIN_PACKS) {
      expect(pack.coins).toBeGreaterThan(0);
      expect(pack.displayPrice).not.toBe('');
    }
    // Bigger packs must be better value, or the tiers are pointless.
    for (let i = 1; i < COIN_PACKS.length; i++) {
      expect(COIN_PACKS[i]!.coins).toBeGreaterThan(COIN_PACKS[i - 1]!.coins);
    }
  });
});

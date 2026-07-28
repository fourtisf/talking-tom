/**
 * In-app purchases. Spec §13.
 *
 * v1 offers coin packs only. The "remove ads" SKU is defined and wired but
 * gated behind `FEATURES.removeAdsIap`, because §13 asks for confirmation
 * before building it — see the open questions in the README.
 *
 * Like `Ads`, the store plugin (`@capacitor-community/in-app-purchases`) is not
 * resolvable on this registry, so purchasing sits behind `IapProvider`. The
 * payout path — validate, then credit through `Economy` — is provider-agnostic
 * and is the part that must not be duplicated anywhere else.
 */

import { FEATURES, UNLOCK_LEVEL } from '@/config/tuning';
import type { Economy } from '@/core/Economy';
import type { GameState } from '@/core/GameState';
import { analytics } from '@/services/Analytics';

export interface CoinPack {
  readonly sku: string;
  readonly name: string;
  readonly coins: number;
  /** Display only — the store is authoritative on real pricing. */
  readonly displayPrice: string;
}

export const COIN_PACKS: readonly CoinPack[] = [
  { sku: 'biskit.coins.small', name: 'Pocketful', coins: 1_200, displayPrice: '$0.99' },
  { sku: 'biskit.coins.medium', name: 'Treat Jar', coins: 6_500, displayPrice: '$4.99' },
  { sku: 'biskit.coins.large', name: 'Toy Chest', coins: 15_000, displayPrice: '$9.99' },
] as const;

export const REMOVE_ADS_SKU = 'biskit.removeads' as const;

export type PurchaseResult =
  | { status: 'purchased'; sku: string }
  | { status: 'restored'; sku: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'failed'; message: string }
  | { status: 'locked'; unlocksAtLevel: number };

export interface IapProvider {
  readonly id: string;
  isReady(): boolean;
  purchase(sku: string): Promise<{ ok: boolean; cancelled?: boolean; message?: string }>;
  restore(): Promise<readonly string[]>;
}

/** Web/test stand-in. Refuses politely rather than pretending to sell things. */
export class StubIapProvider implements IapProvider {
  readonly id = 'stub';
  isReady(): boolean {
    return false;
  }
  purchase(): Promise<{ ok: boolean; message?: string }> {
    return Promise.resolve({ ok: false, message: 'Store unavailable in this build' });
  }
  restore(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
}

export class Iap {
  private readonly state: GameState;
  private readonly economy: Economy;
  private provider: IapProvider;

  constructor(state: GameState, economy: Economy, provider: IapProvider = new StubIapProvider()) {
    this.state = state;
    this.economy = economy;
    this.provider = provider;
  }

  setProvider(provider: IapProvider): void {
    this.provider = provider;
  }

  /** No IAP before level 3 — let the loop land first (§13). */
  get isAvailable(): boolean {
    return this.state.level >= UNLOCK_LEVEL.monetisation && this.provider.isReady();
  }

  get catalogue(): readonly CoinPack[] {
    return COIN_PACKS;
  }

  get offersRemoveAds(): boolean {
    return FEATURES.removeAdsIap;
  }

  get hasRemovedAds(): boolean {
    return this.state.owns(REMOVE_ADS_SKU);
  }

  async buyCoinPack(sku: string): Promise<PurchaseResult> {
    const pack = COIN_PACKS.find((p) => p.sku === sku);
    if (!pack) return { status: 'failed', message: `Unknown pack "${sku}"` };

    if (this.state.level < UNLOCK_LEVEL.monetisation) {
      return { status: 'locked', unlocksAtLevel: UNLOCK_LEVEL.monetisation };
    }
    if (!this.provider.isReady()) return { status: 'unavailable' };

    analytics.track('iap_started', { sku, coins: pack.coins });
    const outcome = await this.provider.purchase(sku);

    if (outcome.cancelled) {
      analytics.track('iap_cancelled', { sku });
      return { status: 'cancelled' };
    }
    if (!outcome.ok) {
      analytics.track('iap_failed', { sku, message: outcome.message ?? '' });
      return { status: 'failed', message: outcome.message ?? 'Purchase failed' };
    }

    // Consumable: credit through Economy so the coins are visible to analytics.
    this.economy.earn(pack.coins, 'iap');
    analytics.track('iap_purchased', { sku, coins: pack.coins });
    return { status: 'purchased', sku };
  }

  async buyRemoveAds(): Promise<PurchaseResult> {
    if (!FEATURES.removeAdsIap) return { status: 'unavailable' };
    if (this.hasRemovedAds) return { status: 'restored', sku: REMOVE_ADS_SKU };
    if (!this.provider.isReady()) return { status: 'unavailable' };

    const outcome = await this.provider.purchase(REMOVE_ADS_SKU);
    if (outcome.cancelled) return { status: 'cancelled' };
    if (!outcome.ok) return { status: 'failed', message: outcome.message ?? 'Purchase failed' };

    // Non-consumable: entitlement lives in the inventory, not the wallet.
    this.state.addItem(REMOVE_ADS_SKU);
    analytics.track('iap_purchased', { sku: REMOVE_ADS_SKU });
    return { status: 'purchased', sku: REMOVE_ADS_SKU };
  }

  /** Store policy requires a restore path for non-consumables. */
  async restore(): Promise<readonly string[]> {
    const skus = await this.provider.restore();
    for (const sku of skus) {
      if (sku === REMOVE_ADS_SKU) this.state.addItem(sku);
    }
    analytics.track('iap_restored', { count: skus.length });
    return skus;
  }
}

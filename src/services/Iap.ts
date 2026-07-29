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

import {
  COIN_PACKS,
  FEATURES,
  REMOVE_ADS_SKU,
  UNLOCK_LEVEL,
  type CoinPackDef,
} from '@/config/tuning';
import type { Economy } from '@/core/Economy';
import type { GameState } from '@/core/GameState';
import { analytics } from '@/services/Analytics';
import { t } from '@/i18n';

/**
 * The catalogue itself lives in `config/tuning.ts` — pack coin amounts are
 * balance numbers, and §3 says those have exactly one home. Re-exported here so
 * callers have one import for everything IAP.
 */
export type CoinPack = CoinPackDef;
export { COIN_PACKS, REMOVE_ADS_SKU };

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
    // English on purpose, and the only string in the codebase that stays that
    // way: `Iap.message()` no longer shows a provider's text to anybody, it
    // forwards it to analytics. This sentence is for whoever reads the log.
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

  /**
   * Two separate questions, deliberately.
   *
   * `isUnlocked` is the §13 design gate: no IAP before level 3, let the loop
   * land first. It decides whether the player is ever shown a price.
   *
   * `isStoreReady` is whether the billing library is actually connected. A
   * player past the gate on a device with no store still sees the packs and
   * gets told plainly why the purchase cannot proceed — the same rule §13 sets
   * for a failed ad fill: never silently no-op.
   */
  get isUnlocked(): boolean {
    return this.state.level >= UNLOCK_LEVEL.monetisation;
  }

  get isStoreReady(): boolean {
    return this.provider.isReady();
  }

  get isAvailable(): boolean {
    return this.isUnlocked && this.isStoreReady;
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

    if (!this.isUnlocked) {
      return { status: 'locked', unlocksAtLevel: UNLOCK_LEVEL.monetisation };
    }
    if (!this.isStoreReady) return { status: 'unavailable' };

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
    if (!this.isUnlocked) {
      return { status: 'locked', unlocksAtLevel: UNLOCK_LEVEL.monetisation };
    }
    if (!this.isStoreReady) return { status: 'unavailable' };

    const outcome = await this.provider.purchase(REMOVE_ADS_SKU);
    if (outcome.cancelled) return { status: 'cancelled' };
    if (!outcome.ok) return { status: 'failed', message: outcome.message ?? 'Purchase failed' };

    // Non-consumable: entitlement lives in the inventory, not the wallet.
    this.state.addItem(REMOVE_ADS_SKU);
    analytics.track('iap_purchased', { sku: REMOVE_ADS_SKU });
    return { status: 'purchased', sku: REMOVE_ADS_SKU };
  }

  /** Player-facing copy for each outcome. Plain, never blaming the player. */
  static message(result: PurchaseResult): string | null {
    switch (result.status) {
      case 'purchased':
        return null; // the coin fx says it better than words
      case 'restored':
        return t('iap.restored');
      case 'cancelled':
        return null; // the player closed it on purpose; do not nag
      case 'unavailable':
        return t('iap.unavailable');
      case 'locked':
        return t('common.unlocksAtLevel', { level: result.unlocksAtLevel });
      case 'failed':
        // NOT `result.message`. That string comes from the billing library, in
        // whatever language it feels like, often phrased for a developer — and
        // it is untranslatable by construction because we never see it until
        // runtime. It goes to analytics; the player gets a sentence we wrote.
        analytics.track('iap_failed', { detail: result.message ?? '' });
        return t('iap.failed');
    }
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

/**
 * Rewarded video. Spec §13.
 *
 * Rules encoded here, not in the caller:
 *  - rewarded only for v1; no interstitials, no forced ads;
 *  - 10 views/day, reset on a device-local date change;
 *  - nothing before level 3 — let the loop land first;
 *  - **on a fill failure, grant nothing and say so plainly.** Never silently
 *    no-op, and never pay out for an ad that did not play.
 *
 * The mediation SDK (AppLovin MAX per §1) is a native Capacitor plugin that is
 * not on this registry, so it sits behind `RewardedAdProvider`. Ship the stub
 * on web and in tests; register the real adapter in `main.ts` on device. The
 * caps, gating and payout path are identical either way, which is the part
 * worth testing.
 */

import { ADS, EARN, REMOVE_ADS_SKU, UNLOCK_LEVEL } from '@/config/tuning';
import type { Clock } from '@/core/Clock';
import type { Economy } from '@/core/Economy';
import type { GameState } from '@/core/GameState';
import { analytics } from '@/services/Analytics';

export type AdFailureReason = 'no-fill' | 'error' | 'dismissed';

export type AdResult =
  | { status: 'rewarded'; coins: number }
  | { status: 'failed'; reason: AdFailureReason }
  | { status: 'capped'; watchedToday: number }
  | { status: 'locked'; unlocksAtLevel: number };

/** What a mediation SDK has to provide. Deliberately tiny. */
export interface RewardedAdProvider {
  readonly id: string;
  /** Resolve true only if the user actually earned the reward. */
  show(): Promise<{ rewarded: boolean; reason?: AdFailureReason }>;
  isReady(): boolean;
}

/** Stand-in used on web and in tests. Always fills, after a short beat. */
export class StubRewardedAdProvider implements RewardedAdProvider {
  readonly id = 'stub';
  private readonly delayMs: number;
  private readonly outcome: { rewarded: boolean; reason?: AdFailureReason };

  constructor(
    delayMs = 900,
    outcome: { rewarded: boolean; reason?: AdFailureReason } = { rewarded: true },
  ) {
    this.delayMs = delayMs;
    this.outcome = outcome;
  }

  isReady(): boolean {
    return true;
  }

  show(): Promise<{ rewarded: boolean; reason?: AdFailureReason }> {
    return new Promise((resolve) => setTimeout(() => resolve(this.outcome), this.delayMs));
  }
}

export class Ads {
  private readonly state: GameState;
  private readonly economy: Economy;
  private readonly time: Clock;
  private provider: RewardedAdProvider | null;
  private showing = false;

  constructor(
    state: GameState,
    economy: Economy,
    time: Clock,
    provider: RewardedAdProvider | null = null,
  ) {
    this.state = state;
    this.economy = economy;
    this.time = time;
    this.provider = provider;
  }

  /** Swap in the real mediation adapter once the native plugin is wired. */
  setProvider(provider: RewardedAdProvider): void {
    this.provider = provider;
  }

  /** Roll the counter if the device-local day changed while we were away. */
  refreshDay(): void {
    this.state.rollAdDay(this.time.localDayKey());
  }

  get watchesToday(): number {
    this.refreshDay();
    return this.state.adWatchesToday;
  }

  get remainingToday(): number {
    return Math.max(0, ADS.dailyCap - this.watchesToday);
  }

  /** Whether the rewarded-video button should be shown at all. */
  get isAvailable(): boolean {
    if (this.state.level < UNLOCK_LEVEL.monetisation) return false;
    return this.remainingToday > 0;
  }

  /**
   * True once the player owns the "remove ads" entitlement.
   *
   * This suppresses FORCED formats only — interstitials and banners. Rewarded
   * video is opt-in and is a coin source, so removing it would be a downgrade
   * the player did not ask for and would quietly delete an earn path from §7.
   *
   * v1 ships no forced formats (`ADS.forcedFormatsEnabled` is false), so today
   * this entitlement suppresses nothing. It is honoured here so that the day an
   * interstitial is added, it is already respected rather than retrofitted.
   */
  get hasRemovedAds(): boolean {
    return this.state.owns(REMOVE_ADS_SKU);
  }

  /** Whether a forced (non-rewarded) ad may be shown right now. */
  canShowForcedAd(): boolean {
    if (!ADS.forcedFormatsEnabled) return false;
    if (this.hasRemovedAds) return false;
    return this.state.level >= UNLOCK_LEVEL.monetisation;
  }

  /**
   * Is there anything for the "remove ads" SKU to actually remove?
   *
   * Selling an entitlement that changes nothing is the kind of thing that gets
   * a store listing pulled, so the settings row asks this before offering it.
   */
  static get hasAnythingToRemove(): boolean {
    return ADS.forcedFormatsEnabled;
  }

  get isLocked(): boolean {
    return this.state.level < UNLOCK_LEVEL.monetisation;
  }

  async showRewarded(): Promise<AdResult> {
    if (this.isLocked) {
      return { status: 'locked', unlocksAtLevel: UNLOCK_LEVEL.monetisation };
    }

    this.refreshDay();
    if (this.state.adWatchesToday >= ADS.dailyCap) {
      analytics.track('ad_capped', { watchedToday: this.state.adWatchesToday });
      return { status: 'capped', watchedToday: this.state.adWatchesToday };
    }

    if (this.showing) return { status: 'failed', reason: 'error' };
    this.showing = true;

    try {
      if (!this.provider || !this.provider.isReady()) {
        analytics.track('ad_failed', { reason: 'no-fill', provider: this.provider?.id ?? 'none' });
        return { status: 'failed', reason: 'no-fill' };
      }

      analytics.track('ad_requested', { provider: this.provider.id });
      const outcome = await this.provider.show();

      if (!outcome.rewarded) {
        const reason = outcome.reason ?? 'dismissed';
        analytics.track('ad_failed', { reason, provider: this.provider.id });
        // Grant nothing. The caller surfaces the reason.
        return { status: 'failed', reason };
      }

      // Count the watch before paying, so a crash mid-payout cannot be farmed.
      this.state.recordAdWatch(this.time.localDayKey());
      this.economy.earn(EARN.rewardedAdCoins, 'rewarded-ad');
      analytics.track('ad_rewarded', {
        coins: EARN.rewardedAdCoins,
        watchedToday: this.state.adWatchesToday,
      });
      return { status: 'rewarded', coins: EARN.rewardedAdCoins };
    } catch (err) {
      console.warn('[Ads] provider threw', err);
      analytics.track('ad_failed', { reason: 'error' });
      return { status: 'failed', reason: 'error' };
    } finally {
      this.showing = false;
    }
  }
}

/** Player-facing copy for each outcome. Plain, never blaming the player. */
export function adResultMessage(result: AdResult): string | null {
  switch (result.status) {
    case 'rewarded':
      return null; // the coin fx says it better than words
    case 'capped':
      return `That's all the video rewards for today — back tomorrow!`;
    case 'locked':
      return `Unlocks at level ${result.unlocksAtLevel}`;
    case 'failed':
      switch (result.reason) {
        case 'no-fill':
          return 'No video available right now — nothing was charged.';
        case 'dismissed':
          return 'Video closed early, so no coins this time.';
        case 'error':
          return "Couldn't load that video. Try again in a moment.";
      }
  }
}

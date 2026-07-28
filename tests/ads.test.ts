import { beforeEach, describe, expect, it } from 'vitest';

import {
  Ads,
  StubRewardedAdProvider,
  adResultMessage,
  type AdFailureReason,
  type RewardedAdProvider,
} from '@/services/Ads';
import { ADS, EARN, UNLOCK_LEVEL } from '@/config/tuning';
import { Clock } from '@/core/Clock';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import { analytics } from '@/services/Analytics';

/** A provider whose outcome each test dictates. */
class ScriptedProvider implements RewardedAdProvider {
  readonly id = 'scripted';
  calls = 0;
  constructor(
    private readonly ready: boolean,
    private readonly outcome: { rewarded: boolean; reason?: AdFailureReason },
  ) {}
  isReady(): boolean {
    return this.ready;
  }
  show(): Promise<{ rewarded: boolean; reason?: AdFailureReason }> {
    this.calls += 1;
    return Promise.resolve(this.outcome);
  }
}

function setup(level: number = UNLOCK_LEVEL.monetisation, atMs = new Date(2026, 4, 12, 12).getTime()) {
  let wall = atMs;
  let mono = 0;
  const time = new Clock({ wallNow: () => wall, monotonicNow: () => mono });

  const save = createDefaultSave(atMs);
  save.level = level;
  save.coins = 0;
  const state = new GameState(save);
  const economy = new Economy(state);

  return {
    state,
    economy,
    time,
    make: (provider: RewardedAdProvider | null) => new Ads(state, economy, time, provider),
    advanceDays(days: number) {
      wall += days * 24 * 60 * 60 * 1000;
      mono += days * 24 * 60 * 60 * 1000;
    },
  };
}

describe('Ads (§13)', () => {
  beforeEach(() => analytics.reset());

  it('pays exactly the tabled reward on a fill', async () => {
    const ctx = setup();
    const ads = ctx.make(new ScriptedProvider(true, { rewarded: true }));

    const result = await ads.showRewarded();
    expect(result).toEqual({ status: 'rewarded', coins: EARN.rewardedAdCoins });
    expect(ctx.state.coins).toBe(EARN.rewardedAdCoins);
    expect(ctx.state.adWatchesToday).toBe(1);
  });

  it('grants NOTHING when the ad fails to fill, and says so', async () => {
    const ctx = setup();
    const ads = ctx.make(new ScriptedProvider(false, { rewarded: true }));

    const result = await ads.showRewarded();
    expect(result).toEqual({ status: 'failed', reason: 'no-fill' });
    expect(ctx.state.coins).toBe(0);
    expect(ctx.state.adWatchesToday).toBe(0);
    expect(adResultMessage(result)).toMatch(/nothing was charged/i);
  });

  it('grants nothing when the player dismisses the video early', async () => {
    const ctx = setup();
    const ads = ctx.make(new ScriptedProvider(true, { rewarded: false, reason: 'dismissed' }));

    const result = await ads.showRewarded();
    expect(result).toEqual({ status: 'failed', reason: 'dismissed' });
    expect(ctx.state.coins).toBe(0);
    expect(ctx.state.adWatchesToday).toBe(0);
  });

  it('grants nothing when there is no provider at all', async () => {
    const ctx = setup();
    const ads = ctx.make(null);
    expect(await ads.showRewarded()).toEqual({ status: 'failed', reason: 'no-fill' });
    expect(ctx.state.coins).toBe(0);
  });

  it('survives a provider that throws', async () => {
    const ctx = setup();
    const exploding: RewardedAdProvider = {
      id: 'boom',
      isReady: () => true,
      show: () => Promise.reject(new Error('SDK exploded')),
    };
    const ads = ctx.make(exploding);
    expect(await ads.showRewarded()).toEqual({ status: 'failed', reason: 'error' });
    expect(ctx.state.coins).toBe(0);
  });

  it('caps at ten views a day', async () => {
    const ctx = setup();
    const provider = new ScriptedProvider(true, { rewarded: true });
    const ads = ctx.make(provider);

    for (let i = 0; i < ADS.dailyCap; i++) {
      expect((await ads.showRewarded()).status).toBe('rewarded');
    }
    const overflow = await ads.showRewarded();
    expect(overflow.status).toBe('capped');
    expect(ctx.state.coins).toBe(EARN.rewardedAdCoins * ADS.dailyCap);
    expect(provider.calls).toBe(ADS.dailyCap);
    expect(ads.remainingToday).toBe(0);
    expect(ads.isAvailable).toBe(false);
  });

  it('resets the cap on a device-local date change', async () => {
    const ctx = setup();
    const ads = ctx.make(new ScriptedProvider(true, { rewarded: true }));

    for (let i = 0; i < ADS.dailyCap; i++) await ads.showRewarded();
    expect((await ads.showRewarded()).status).toBe('capped');

    ctx.advanceDays(1);
    expect(ads.remainingToday).toBe(ADS.dailyCap);
    expect((await ads.showRewarded()).status).toBe('rewarded');
    expect(ctx.state.adWatchesToday).toBe(1);
  });

  it('offers nothing before the monetisation level', async () => {
    const ctx = setup(UNLOCK_LEVEL.monetisation - 1);
    const provider = new ScriptedProvider(true, { rewarded: true });
    const ads = ctx.make(provider);

    expect(ads.isLocked).toBe(true);
    expect(ads.isAvailable).toBe(false);
    const result = await ads.showRewarded();
    expect(result).toEqual({ status: 'locked', unlocksAtLevel: UNLOCK_LEVEL.monetisation });
    expect(provider.calls).toBe(0);
    expect(ctx.state.coins).toBe(0);
  });

  it('never runs two videos at once', async () => {
    const ctx = setup();
    const slow: RewardedAdProvider = {
      id: 'slow',
      isReady: () => true,
      show: () => new Promise((resolve) => setTimeout(() => resolve({ rewarded: true }), 20)),
    };
    const ads = ctx.make(slow);

    const [first, second] = await Promise.all([ads.showRewarded(), ads.showRewarded()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['failed', 'rewarded']);
    expect(ctx.state.coins).toBe(EARN.rewardedAdCoins);
  });

  it('the stub provider fills, so web builds stay exercisable', async () => {
    const ctx = setup();
    const ads = ctx.make(new StubRewardedAdProvider(0));
    expect((await ads.showRewarded()).status).toBe('rewarded');
  });
});

/**
 * Lifetime milestones: the counters, the payout, and the ordering.
 *
 * The failure modes here are all quiet ones. A double-claim is free gems and
 * nothing on screen says so. A counter that stops at the last tier looks
 * identical until the release that adds a tier, at which point the players who
 * earned it hardest see it at zero. And the sort order is the only thing
 * standing between sixteen rows and a claimable one nobody scrolls to.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AWARDS } from '@/config/tuning';
import { Awards } from '@/core/Awards';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import { Progression } from '@/core/Progression';

function build() {
  const state = new GameState(createDefaultSave(0));
  const economy = new Economy(state);
  const progression = new Progression(state, economy);
  const awards = new Awards(state, economy, progression);
  awards.start();
  return { state, economy, progression, awards };
}

describe('the awards table itself', () => {
  it('has no duplicate ids', () => {
    const ids = AWARDS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pays something for every one of them', () => {
    for (const a of AWARDS) {
      expect(a.gems).toBeGreaterThan(0);
      expect(a.target).toBeGreaterThan(0);
    }
  });

  /**
   * Tiers on one trigger have to climb. Two awards on the same counter with
   * the same target both complete on the same action, which reads as a bug
   * even though it pays correctly — and a cheaper tier ABOVE a dearer one
   * means the big milestone is worth less than the small one it contains.
   */
  it('keeps each trigger a rising ladder', () => {
    const byTrigger = new Map<string, typeof AWARDS[number][]>();
    for (const a of AWARDS) {
      const list = byTrigger.get(a.trigger) ?? [];
      list.push(a);
      byTrigger.set(a.trigger, list);
    }
    for (const [, tiers] of byTrigger) {
      const sorted = [...tiers].sort((x, y) => x.target - y.target);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.target).toBeGreaterThan(sorted[i - 1]!.target);
        expect(sorted[i]!.gems).toBeGreaterThanOrEqual(sorted[i - 1]!.gems);
      }
    }
  });
});

describe('counting', () => {
  let kit: ReturnType<typeof build>;
  beforeEach(() => {
    kit = build();
  });

  it('counts the same action toward every tier on that trigger', () => {
    kit.awards.record('feed', 10);
    const feed = kit.awards.list.filter((a) => a.def.trigger === 'feed');
    expect(feed.find((a) => a.def.target === 10)?.done).toBe(true);
    // The 60 and 250 tiers read the SAME counter, so they are already 10 in
    // rather than sitting at zero waiting for their own count to start.
    expect(feed.find((a) => a.def.target === 60)?.count).toBe(10);
  });

  it('keeps counting after the last tier is claimed', () => {
    kit.awards.record('photo', 40);
    // A tier added in a later release must open at the count the player has
    // actually earned, not at whatever the ladder stopped recording.
    expect(kit.state.lifetime['photo']).toBe(40);
  });

  it('counts real actions off the same stream Tasks listens to', () => {
    kit.progression.award('feed');
    expect(kit.state.lifetime['feed']).toBe(1);
  });

  it('ignores a task payout, which is not an action', () => {
    kit.progression.award('feed');
    const before = kit.state.lifetime['feed'] ?? 0;
    // `award` will not take 'task' — the table has no rate for it — so a task
    // claim arrives through `awardFlat`, which is the path that has to be
    // excluded. Claiming "feed 3 times" would otherwise tick the lifetime feed
    // counter a fourth time, the same exclusion `Tasks` makes.
    kit.progression.awardFlat(18, 'task');
    expect(kit.state.lifetime['feed'] ?? 0).toBe(before);
    expect(kit.state.lifetime['task']).toBeUndefined();
  });
});

describe('claiming', () => {
  let kit: ReturnType<typeof build>;
  beforeEach(() => {
    kit = build();
  });

  it('pays the gems once and only once', () => {
    kit.awards.record('photo', 1);
    const before = kit.state.gems;
    expect(kit.awards.claim('photo1')).toBe(true);
    expect(kit.state.gems).toBe(before + 1);
    // The second call is the one that matters: a sheet redrawing mid-tap, a
    // double-tap, a restored save — all reach here, and all must pay nothing.
    expect(kit.awards.claim('photo1')).toBe(false);
    expect(kit.state.gems).toBe(before + 1);
  });

  it('refuses an unfinished award', () => {
    expect(kit.awards.claim('feed250')).toBe(false);
    expect(kit.state.gems).toBe(createDefaultSave(0).gems);
  });

  it('refuses an id that does not exist', () => {
    expect(kit.awards.claim('nope')).toBe(false);
  });

  it('drops out of the claimable count once collected', () => {
    kit.awards.record('photo', 1);
    expect(kit.awards.claimableCount).toBe(1);
    kit.awards.claim('photo1');
    expect(kit.awards.claimableCount).toBe(0);
  });
});

describe('the order the sheet shows them in', () => {
  it('puts claimable first, collected last, and the nearest in between', () => {
    const kit = build();
    kit.awards.record('photo', 1); // photo1 done, photo15 at 1/15
    kit.awards.record('pet', 45); // pet50 at 45/50 — nearly there
    kit.awards.record('feed', 1); // feed10 at 1/10 — barely started

    const order = kit.awards.sorted;
    expect(order[0]?.def.id).toBe('photo1');

    const ids = order.map((a) => a.def.id);
    // Sixteen rows do not fit on a phone. If "nearly done" sorted below
    // "barely started" the sheet would open on the least useful information
    // it has.
    expect(ids.indexOf('pet50')).toBeLessThan(ids.indexOf('feed10'));

    kit.awards.claim('photo1');
    const after = kit.awards.sorted.map((a) => a.def.id);
    expect(after[after.length - 1]).toBe('photo1');
  });
});

/**
 * The two wearable racks.
 *
 * Adding outfits turned one slot into two, and the thing that makes that
 * dangerous is `ownedItems`: it is a single flat list of ids, shared by both
 * racks, so an outfit that reuses a hat's id would be silently free the moment
 * you bought the hat. Nothing in the type system catches that. This does.
 *
 * The rest is the pacing. Both racks are gated by level and paid for out of two
 * pockets, and the gem items are supposed to be the ones you arrive at rather
 * than the ones you save for — a gem outfit that unlocks at level 1 would
 * quietly undo that.
 */

import { describe, expect, it } from 'vitest';

import { DECOR, HATS, OUTFITS, WEARABLES } from '@/config/tuning';
import { EN, type MessageKey } from '@/i18n/en';
import { wearableName } from '@/i18n/content';

describe('the racks', () => {
  it('are all non-empty', () => {
    expect(HATS.length).toBeGreaterThan(0);
    expect(OUTFITS.length).toBeGreaterThan(0);
    expect(DECOR.length).toBeGreaterThan(0);
  });

  it('add up to everything buyable', () => {
    // Three racks now. `decor` is not worn by the cat and rides the same
    // buy/equip/persist path anyway — see the note on `WearSlot`.
    expect(WEARABLES.length).toBe(HATS.length + OUTFITS.length + DECOR.length);
  });

  it('tag every item with the slot it goes in', () => {
    expect(HATS.every((h) => h.slot === 'hat')).toBe(true);
    expect(OUTFITS.every((o) => o.slot === 'outfit')).toBe(true);
    expect(DECOR.every((d) => d.slot === 'decor')).toBe(true);
  });

  /**
   * The one that actually protects a player's coins. `GameState.owns` matches
   * on id alone, so a collision between the racks means buying one item hands
   * over the other.
   */
  it('never reuse an id, across both racks', () => {
    const ids = WEARABLES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the pacing', () => {
  it('opens each rack at level 1, so a new player has something to want', () => {
    expect(Math.min(...HATS.map((h) => h.unlockLevel))).toBe(1);
    expect(Math.min(...OUTFITS.map((o) => o.unlockLevel))).toBe(1);
  });

  it('never gates a coin item behind a level a gem item does not reach first', () => {
    // Gems only come from levelling. If the cheapest gem item unlocked before
    // any level-up could have paid for it, the price would be unreachable copy.
    for (const item of WEARABLES.filter((w) => w.currency === 'gems')) {
      expect(item.unlockLevel).toBeGreaterThan(1);
    }
  });

  it('prices outfits above the cheapest hat — an outfit is more of the cat', () => {
    const cheapestHat = Math.min(...HATS.filter((h) => h.currency === 'coins').map((h) => h.price));
    const cheapestFit = Math.min(
      ...OUTFITS.filter((o) => o.currency === 'coins').map((o) => o.price),
    );
    expect(cheapestFit).toBeGreaterThan(cheapestHat);
  });

  it('leaves the long-game prize on the hat rack', () => {
    const dearestHat = Math.max(...HATS.filter((h) => h.currency === 'coins').map((h) => h.price));
    const dearestFit = Math.max(
      ...OUTFITS.filter((o) => o.currency === 'coins').map((o) => o.price),
    );
    expect(dearestFit).toBeLessThan(dearestHat);
  });
});

describe('names', () => {
  it('resolve from the catalogue, per slot', () => {
    for (const item of WEARABLES) {
      const key = `${item.slot}.${item.id}` as MessageKey;
      expect(wearableName(item.slot, item.id, item.name)).toBe(EN[key]);
    }
  });

  it('fall back to the English in tuning.ts when a key is missing', () => {
    expect(wearableName('outfit', 'not-a-thing', 'Poncho')).toBe('Poncho');
  });
});

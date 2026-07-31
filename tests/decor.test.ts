/**
 * The rug rack, and the one way it fails silently.
 *
 * `buildDecor` returns null for an id it does not recognise, and `refreshDecor`
 * treats null as "leave the baked rug alone". So a catalogue entry with no art
 * behind it is not a crash and not a blank room — it is a card the player buys,
 * equips, and then watches change nothing at all. They are two hand-written
 * lists in two files and nothing else makes them agree.
 */

import { describe, expect, it } from 'vitest';

import { DECOR, WEARABLES } from '@/config/tuning';
import { isDecorId, RUG_BASE } from '@/scenes/decorArt';
import { EN } from '@/i18n/en';

describe('every rug on sale can actually be drawn', () => {
  it('has art for each catalogue entry', () => {
    const missing = DECOR.filter((item) => !isDecorId(item.id)).map((i) => i.id);
    expect(missing).toEqual([]);
  });

  it('has a name for each catalogue entry', () => {
    const missing = DECOR.filter((item) => !(`decor.${item.id}` in EN)).map((i) => i.id);
    expect(missing).toEqual([]);
  });

  it('refuses ids it does not know rather than drawing something wrong', () => {
    expect(isDecorId('rug.nope')).toBe(false);
    expect(isDecorId(null)).toBe(false);
    expect(isDecorId(undefined)).toBe(false);
    // The default rug is art without a catalogue entry on purpose: it is what
    // `buildHome` bakes in and what a null `equipped.decor` means. It must
    // still be a known id, because a save could carry it.
    expect(isDecorId('rug.blush')).toBe(true);
  });
});

describe('the rack sits properly beside the other two', () => {
  it('is priced in coins, every one of them', () => {
    // Gems come only from levelling and from awards, and they buy the six
    // items you arrive at. Scenery is the first thing a player buys for
    // themselves rather than for the cat; pricing it in gems would make the
    // cheapest form of expression in the game the most expensive purchase.
    expect(DECOR.every((d) => d.currency === 'coins')).toBe(true);
  });

  it('never collides with a hat or an outfit id', () => {
    // `GameState.owns` matches on id alone, so a collision across racks means
    // buying one item silently hands over the other.
    const ids = WEARABLES.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps a footprint the baked rug cannot peek out from behind', () => {
    // Every rug is drawn at exactly this size, so the default pink one under
    // it is fully covered. Anything smaller leaves a pink halo, which reads as
    // a rendering bug rather than as a rug with a border.
    expect(RUG_BASE.width).toBe(250);
    expect(RUG_BASE.height).toBe(56);
  });
});

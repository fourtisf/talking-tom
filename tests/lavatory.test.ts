/**
 * The lavatory, and the one line the whole room stands on.
 *
 * A front-facing rig cannot squat, cannot turn and has no hip joint. The room
 * gets away with putting her on a lavatory by drawing the seat's inner lip OVER
 * her, so everything the rig cannot do happens behind porcelain — she is just
 * the ordinary standing pose, lifted.
 *
 * That works or fails on arithmetic, at every screen width, and it fails in the
 * worst possible way: a leg poking out through the bowl. It is spread across
 * three files that have no reason to know about each other (`rigLayout` places
 * her limbs, `HomeScene` lifts her by `LOO_PET_RISE`, `looLayout` places the
 * lip), and it is invisible in a screenshot of whichever width you happened to
 * open. So the lip gets walked against her, column by column, here.
 */

import { describe, expect, it } from 'vitest';

import { DESIGN_HEIGHT, PLACEMENTS } from '@/pet/rigLayout';
import { DEPOSIT, LOO_PET_RISE, looGeometry, occluderTopY } from '@/scenes/looLayout';
import { BATH_PET_RISE } from '@/scenes/bathLayout';

/** The scene HomeScene builds: canvas 860 less the 232px dock. */
const SCENE_HEIGHT = 628;
const PET_SCALE = (SCENE_HEIGHT * 0.55) / DESIGN_HEIGHT;
const STANDING_FEET_Y = SCENE_HEIGHT - 52;
/** Her rig origin while she is on the seat. */
const ORIGIN_Y = STANDING_FEET_Y - LOO_PET_RISE;

function room(width: number) {
  return { width, height: SCENE_HEIGHT, floorY: SCENE_HEIGHT * 0.7 };
}

/** Screen y of a rig-space y. */
const at = (rigY: number): number => ORIGIN_Y + rigY * PET_SCALE;

/* The three ellipses that matter, in rig units, from `PetArt`'s draws. */
const TORSO = { rx: 64, ry: 52 };
const LEG = { rx: 30, ry: 21 };

/** Vertical half-extent of an ellipse at horizontal offset `dx` from its centre. */
function halfHeightAt(dx: number, rx: number, ry: number): number | null {
  const u = dx / rx;
  if (Math.abs(u) >= 1) return null;
  return ry * Math.sqrt(1 - u * u);
}

/** Screen y of the LOWEST torso pixel in the column `dx` from the pet's centre. */
function torsoBottom(dx: number): number | null {
  const h = halfHeightAt(dx / PET_SCALE, TORSO.rx, TORSO.ry);
  return h === null ? null : at(PLACEMENTS.body.y + h);
}

/** Screen y of the HIGHEST leg pixel in that column, over both legs. */
function legTop(dx: number): number | null {
  let top: number | null = null;
  for (const leg of [PLACEMENTS.legL, PLACEMENTS.legR]) {
    const h = halfHeightAt(dx / PET_SCALE - leg.x, LEG.rx, LEG.ry);
    if (h === null) continue;
    const y = at(leg.y - h);
    top = top === null ? y : Math.min(top, y);
  }
  return top;
}

/** Phone, the widest room column, and one in between. */
const WIDTHS = [420, 600, 940];
/** Every column the seat board spans, at 1px. Nothing sampled, nothing missed. */
const COLUMNS = Array.from({ length: 241 }, (_, i) => i - 120);

describe('nothing she cannot do is visible', () => {
  /**
   * THE ONE THAT MATTERS. A leg above the lip is a cat standing behind a
   * lavatory with her feet showing through it, which is both wrong and, at
   * this subject matter, the crude reading rather than the polite one.
   */
  it.each(WIDTHS)('hides both legs entirely, at every column (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const escaped = COLUMNS.filter((dx) => {
      const top = legTop(dx);
      return top !== null && top < occluderTopY(loo, dx);
    });
    expect(escaped).toEqual([]);
  });

  it.each(WIDTHS)('never leaves a leg outside the board altogether (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    // A leg beyond ±seatRx has nothing drawn over it at all, whatever the
    // lip does — `occluderTopY` returns Infinity there and the test above
    // would pass vacuously.
    const widest = Math.max(
      ...COLUMNS.filter((dx) => legTop(dx) !== null).map((dx) => Math.abs(dx)),
    );
    expect(widest).toBeLessThan(loo.seatRx);
  });
});

describe('she is IN the ring, not perched on it', () => {
  /**
   * If the lip clears her torso everywhere, she is a cat balanced on top of a
   * closed lid. The middle of her has to be behind it.
   */
  it.each(WIDTHS)('sinks her torso below the lip at the middle (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const bottom = torsoBottom(0);
    expect(bottom).not.toBeNull();
    expect(bottom as number).toBeGreaterThan(occluderTopY(loo, 0) + 10);
  });

  /**
   * The heart on her chest is the mark that identifies her, and it is also the
   * TIGHTEST thing in this room: its tip and the tops of her legs are 3.8 rig
   * units apart, so the lip has to thread between them. No arrangement of
   * rise, hole width and hole depth clears the heart by more than about 3px.
   * If this ever fails, the answer is not to nudge the lip — there is nowhere
   * for it to go — it is to move the marking or the legs.
   */
  it.each(WIDTHS)('leaves the heart on her chest showing (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    // `body()` draws it as a triangle from y 8 down to a point at y 27.
    expect(at(PLACEMENTS.body.y + 27)).toBeLessThan(occluderTopY(loo, 0));
    // Its lobes, which carry the shape, clear it by a comfortable margin.
    expect(at(PLACEMENTS.body.y + 14.5)).toBeLessThan(occluderTopY(loo, 0) - 10);
  });

  it.each(WIDTHS)('keeps her arms and face well clear (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const armBottom = at(PLACEMENTS.armL.y + 27);
    // Arms may graze the lip — the toe beans resting on the board is the
    // detail that says she is holding on — but must not be swallowed.
    expect(armBottom).toBeLessThan(occluderTopY(loo, 0) + 14);
    // Her face is the whole payoff and must be nowhere near the porcelain.
    const chin = at(PLACEMENTS.head.y + 94);
    expect(loo.seatCY - chin).toBeGreaterThan(40);
  });
});

describe('the fixture fits the room', () => {
  it.each(WIDTHS)('stands on the floor rather than through it (%ipx)', (width) => {
    const geo = room(width);
    const loo = looGeometry(geo);
    expect(loo.seatCY).toBeGreaterThan(geo.floorY);
    expect(loo.groundY).toBeLessThanOrEqual(geo.height);
    expect(loo.lidTop).toBeLessThan(loo.cisternTop);
    expect(loo.cisternTop).toBeLessThan(loo.seatCY);
  });

  it.each(WIDTHS)('fits inside the room column (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    expect(loo.centreX - loo.seatRx).toBeGreaterThan(0);
    expect(loo.centreX + loo.seatRx).toBeLessThan(width);
  });

  it('lifts her less than the bath does, and the order is not arbitrary', () => {
    // The tub is 140px deep and has to swallow her to the belly; the seat only
    // has to reach her hips. A rise that matched the bath's would put her
    // floating above the board.
    expect(LOO_PET_RISE).toBeLessThan(BATH_PET_RISE);
    expect(LOO_PET_RISE).toBeGreaterThan(0);
  });
});

/**
 * The deposit exists so the tap has a visible result. Two ways it can silently
 * stop having one: sink far enough into the hole that the near lip — which is
 * drawn in FRONT of it — covers the lot, or ride so high that it clears the
 * board's back edge and floats on top of the fixture instead of sitting in it.
 */
describe('what she leaves is actually visible', () => {
  it.each(WIDTHS)('clears the lip by a real amount (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const top = loo.seatCY + DEPOSIT.offsetY - DEPOSIT.height / 2;
    const shown = occluderTopY(loo, 0) - top;
    expect(shown).toBeGreaterThan(20);
  });

  it.each(WIDTHS)('stays inside the bowl rather than on top of it (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const top = loo.seatCY + DEPOSIT.offsetY - DEPOSIT.height / 2;
    // The board's far edge. Above this and it is drawn over the fixture.
    expect(top).toBeGreaterThan(loo.seatCY - loo.seatRy);
    // And it has to fit through the hole it came out of.
    expect(DEPOSIT.width).toBeLessThan(loo.holeRx * 2);
  });

  it.each(WIDTHS)('has its bottom tucked behind the lip (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const bottom = loo.seatCY + DEPOSIT.offsetY + DEPOSIT.height / 2;
    // Sitting entirely above the lip would read as balanced on the rim.
    expect(bottom).toBeGreaterThan(occluderTopY(loo, 0));
  });
});

describe('the occluder itself', () => {
  it('is deepest in the middle and flat past the hole', () => {
    const loo = looGeometry(room(600));
    expect(occluderTopY(loo, 0)).toBe(loo.seatCY + loo.holeRy);
    expect(occluderTopY(loo, loo.holeRx)).toBeCloseTo(loo.seatCY, 6);
    expect(occluderTopY(loo, loo.holeRx + 10)).toBe(loo.seatCY);
    expect(occluderTopY(loo, loo.seatRx + 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('is symmetric', () => {
    const loo = looGeometry(room(600));
    for (const dx of [7, 31, 60, 84, 100]) {
      expect(occluderTopY(loo, dx)).toBe(occluderTopY(loo, -dx));
    }
  });
});

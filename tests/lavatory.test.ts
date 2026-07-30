/**
 * The lavatory, and the difference between sitting ON one and standing IN one.
 *
 * A front-facing rig cannot squat, cannot turn and has no hip joint, and its
 * "legs" are two flat ovals with no knee. The first version of this room hid
 * them behind the seat's inner lip, which meant sinking her far enough into
 * the bowl that the lip crossed her thighs. Every occlusion test passed. It
 * looked like a cat standing in a bucket, and the owner said so.
 *
 * The legs are not drawn here at all now, so she sits HIGH: bottom a few
 * pixels into the ring, paws on the board, bowl behind her. What is checked
 * below is that range — too deep and the bucket comes back, clear of the lip
 * and she is perched on a closed lid — plus the proportion that actually
 * carries the read, which is the board overhanging a bowl narrower than she
 * is. All of it is arithmetic across files that have no reason to agree
 * (`rigLayout` places her, `HomeScene` lifts her, `looLayout` places the
 * porcelain), and none of it is visible in a screenshot of one screen width.
 */

import { describe, expect, it } from 'vitest';

import { DESIGN_HEIGHT, HEAD_RADIUS, PLACEMENTS } from '@/pet/rigLayout';
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

/* The torso ellipse, in rig units, from `PetArt`'s `body()` draw. The legs are
 * not listed: they are not drawn in this room at all. */
const TORSO = { rx: 64, ry: 52 };

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

/** Phone, the widest room column, and one in between. */
const WIDTHS = [420, 600, 940];

describe('she sits ON it, not IN it', () => {
  /**
   * THE ONE THE OWNER CAUGHT BY EYE.
   *
   * The first version sank her deep into the hole so the seat's lip would hide
   * her legs. Every occlusion test passed and it read as a cat standing inside
   * a bucket. The legs are simply not drawn now (`HomeScene.ON_THE_LOO`), so
   * she can sit high — and "high" has a range. Too deep and the bucket is
   * back; clear of the lip altogether and she is perched on a closed lid.
   */
  it.each(WIDTHS)('rests her bottom just inside the ring (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const sunk = (torsoBottom(0) as number) - occluderTopY(loo, 0);
    expect(sunk).toBeGreaterThan(0);
    expect(sunk).toBeLessThan(16);
  });

  /**
   * The bowl must be narrower than she is. When it was not — 188px of pan
   * against 190px of cat, in the same white — the two merged into one shape
   * and no amount of shading separated them. The overhang IS the read.
   */
  it.each(WIDTHS)('sits her on a board that overhangs the bowl (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    expect(loo.seatRx - loo.panRx).toBeGreaterThan(30);
    // Against her WIDEST point, which is her head — that is the silhouette the
    // bowl has to be narrower than, not her waist.
    const widest = HEAD_RADIUS * PET_SCALE;
    expect(loo.panRx).toBeLessThan(widest);
    expect(loo.seatRx).toBeGreaterThan(widest);
  });

  it.each(WIDTHS)('lands her paws on the board rather than through it (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const paws = at(PLACEMENTS.armL.y + 27);
    // Above the lip — visible, resting on the seat — but below its far edge,
    // so they are ON the board and not floating over the cistern.
    expect(paws).toBeLessThan(occluderTopY(loo, 0));
    expect(paws).toBeGreaterThan(loo.seatCY - loo.seatRy);
  });

  it.each(WIDTHS)('leaves the heart on her chest fully clear (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    // Sitting high means this is no longer the tight constraint it was when
    // she was sunk to the hips; it should now clear by a wide margin.
    expect(at(PLACEMENTS.body.y + 27)).toBeLessThan(occluderTopY(loo, 0) - 15);
  });

  it.each(WIDTHS)('keeps her face well away from the porcelain (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    expect(loo.seatCY - at(PLACEMENTS.head.y + 94)).toBeGreaterThan(40);
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

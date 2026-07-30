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

describe('she sits ON it, with the bowl in front of her', () => {
  /**
   * THE ONE THE OWNER CAUGHT BY EYE, TWICE.
   *
   * First she was sunk to the thighs so the lip could hide her legs, and read
   * as standing in a bucket. Then she came up onto the ring but sat over the
   * hole, so the hole was behind her and nothing could be seen happening.
   * She sits on the BACK of the board now: her bottom is above the opening,
   * not in it, and the whole opening is in front of her.
   */
  it.each(WIDTHS)('keeps her bottom clear of the opening (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const holeFarRim = loo.seatCY - loo.holeRy;
    // Above the far rim — sitting on the ring behind it, not down in it.
    expect(torsoBottom(0) as number).toBeLessThan(holeFarRim + 4);
    // But ON the board, not floating above the whole fixture.
    expect(torsoBottom(0) as number).toBeGreaterThan(loo.seatCY - loo.seatRy);
  });

  it.each(WIDTHS)('leaves a real window of bowl in front of her (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const window = occluderTopY(loo, 0) - (torsoBottom(0) as number);
    // The room exists to show what happens in this gap. Too small and the
    // deposit is a smudge under her chin.
    expect(window).toBeGreaterThan(35);
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

  it.each(WIDTHS)('lands her paws on the back ring of the board (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const paws = at(PLACEMENTS.armL.y + 27);
    expect(paws).toBeGreaterThan(loo.seatCY - loo.seatRy);
    expect(paws).toBeLessThan(loo.seatCY);
  });

  it.each(WIDTHS)('draws nothing at all over her (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    // The front layer is now only the board's near crescent, and she sits
    // entirely behind where it starts. Anything crossing her here would be a
    // regression to one of the two versions that read wrong.
    expect(torsoBottom(0) as number).toBeLessThan(occluderTopY(loo, 0));
    expect(at(PLACEMENTS.body.y + 27)).toBeLessThan(occluderTopY(loo, 0) - 30);
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

  /**
   * She is lifted MORE than the bath lifts her, which is the opposite of what
   * you would guess and the reason this is pinned. The tub swallows her to the
   * belly from below; the seat is a shelf she perches on the back of, and the
   * whole point is that the opening stays in front of her. What that costs is
   * headroom, so headroom is what gets checked.
   */
  it.each(WIDTHS)('lifts her high without pushing her off the top (%ipx)', (width) => {
    expect(LOO_PET_RISE).toBeGreaterThan(BATH_PET_RISE);
    // The top of the rig's design space — ear tips and any hat above them.
    expect(at(-DESIGN_HEIGHT)).toBeGreaterThan(50);
    // And she is on the fixture rather than hovering over the cistern.
    expect(torsoBottom(0) as number).toBeGreaterThan(looGeometry(room(width)).lidTop);
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

  it.each(WIDTHS)('lands below her rather than behind her (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const top = loo.seatCY + DEPOSIT.offsetY - DEPOSIT.height / 2;
    // The whole reason she sits on the back of the board. If this ever fails,
    // it is under her and the tap has no visible result again.
    expect(top).toBeGreaterThan(torsoBottom(0) as number);
  });

  it.each(WIDTHS)('stays inside the bowl rather than on top of it (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const top = loo.seatCY + DEPOSIT.offsetY - DEPOSIT.height / 2;
    // Inside the opening, not up on the board behind it.
    expect(top).toBeGreaterThan(loo.seatCY - loo.holeRy);
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

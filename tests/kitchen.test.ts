/**
 * The dining table, and the two things it can silently get wrong.
 *
 * The table is drawn OVER her, so one horizontal line decides how much of the
 * cat the player can see. And the plate is where a half-eaten meal rests, so
 * its distance to her mouth decides whether hand feeding is still a gesture:
 * `FEEDING.openRadius` is the range at which her jaw drops, and a plate inside
 * it means she sits at a laid table with her mouth permanently open, on a
 * target that a release at 79-120px still refuses.
 *
 * Neither is visible in a screenshot of whichever screen you happened to open,
 * and both are spread across four files that have no reason to know about each
 * other — `rigLayout` puts her mouth, `tuning` sets the radii, `HomeScene`
 * lifts her by `TABLE_PET_RISE`, `tableLayout` places the plate. This is where
 * they are made to agree.
 */

import { describe, expect, it } from 'vitest';

import { FEEDING } from '@/config/tuning';
import { DESIGN_HEIGHT, PLACEMENTS } from '@/pet/rigLayout';
import { FOOD_LIFT, PLATE_WIDTH, TABLE_PET_RISE, tableGeometry } from '@/scenes/tableLayout';

/** The scene HomeScene builds: canvas 860 less the 232px dock. */
const SCENE_HEIGHT = 628;

/** Room geometry, mirroring `HomeScene.buildRooms`. */
function room(width: number) {
  return { width, height: SCENE_HEIGHT, floorY: SCENE_HEIGHT * 0.7 };
}

/** The rig's scale and standing feet line, mirroring `HomeScene.buildPet`. */
const PET_SCALE = (SCENE_HEIGHT * 0.55) / DESIGN_HEIGHT;
const STANDING_FEET_Y = SCENE_HEIGHT - 52;

/** Her mouth in scene space while she is sitting at the table. */
function mouthY(): number {
  const feet = STANDING_FEET_Y - TABLE_PET_RISE;
  return feet + (PLACEMENTS.head.y + PLACEMENTS.muzzle.y) * PET_SCALE;
}

/** Bottom of a forepaw — the lowest thing on her that is not a leg. */
function pawBottomY(): number {
  const feet = STANDING_FEET_Y - TABLE_PET_RISE;
  // The arm is an ellipse of ry 27 around its placement.
  return feet + (PLACEMENTS.armL.y + 27) * PET_SCALE;
}

/** Bottom of the torso ellipse. */
function bellyBottomY(): number {
  const feet = STANDING_FEET_Y - TABLE_PET_RISE;
  return feet + (PLACEMENTS.body.y + 52) * PET_SCALE;
}

/** Phone, then the widest column the room is ever composed in. */
const WIDTHS = [420, 600, 940];

describe('the plate is somewhere she can be fed from', () => {
  /**
   * The one that decides whether the feature works. A meal resting inside
   * `openRadius` has her mouth open before the player has moved anything, and
   * the tell that the drop will land is the only feedback `FeedSession` has.
   */
  it.each(WIDTHS)('rests the meal outside the radius her mouth opens at (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    const restY = table.plateY - FOOD_LIFT;
    expect(restY - mouthY()).toBeGreaterThan(FEEDING.openRadius);
  });

  it.each(WIDTHS)('still leaves a real pull to the bite (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    const restY = table.plateY - FOOD_LIFT;
    // From the plate to inside the bite radius: a pull, not a nudge.
    expect(restY - mouthY() - FEEDING.biteRadius).toBeGreaterThan(40);
  });

  it.each(WIDTHS)('sits the plate ON the surface, not off either edge (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    expect(table.plateY).toBeGreaterThan(table.farY);
    expect(table.plateY).toBeLessThan(table.nearY);
    expect(table.plateX - PLATE_WIDTH / 2).toBeGreaterThan(table.left);
    expect(table.plateX + PLATE_WIDTH / 2).toBeLessThan(table.right);
  });

  it('holds a serving. A plate narrower than the food is a coaster', () => {
    expect(PLATE_WIDTH).toBeGreaterThan(FEEDING.size);
  });
});

describe('the table hides the right amount of cat', () => {
  it.each(WIDTHS)('clears her belly, so no outfit is cut in half (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    expect(table.farY).toBeGreaterThan(bellyBottomY());
  });

  it.each(WIDTHS)('stays below her forepaws (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    expect(table.farY).toBeGreaterThan(pawBottomY());
  });

  /**
   * She is lifted so the plate clears the open radius, and the lift is only
   * honest if there is a chair under her. This is the arithmetic the chair is
   * drawn against: it has to reach from behind her shoulders down to the
   * table, or she is sitting on nothing.
   */
  it.each(WIDTHS)('leaves room for a chair back behind her (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    const shoulders = STANDING_FEET_Y - TABLE_PET_RISE + (PLACEMENTS.body.y - 52) * PET_SCALE;
    expect(table.farY - shoulders).toBeGreaterThan(80);
  });

  it.each(WIDTHS)('covers her feet, so she is at the table not behind it (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    expect(table.farY).toBeLessThan(STANDING_FEET_Y - TABLE_PET_RISE);
  });
});

describe('the table fits the room', () => {
  it.each(WIDTHS)('stays inside it, with a margin each side (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    expect(table.left).toBeGreaterThanOrEqual(0);
    expect(table.right).toBeLessThanOrEqual(width);
    expect(table.width).toBeGreaterThan(300);
  });

  it.each(WIDTHS)('stands on the floor rather than through it (%ipx)', (width) => {
    const geo = room(width);
    const table = tableGeometry(geo);
    expect(table.farY).toBeGreaterThan(geo.floorY);
    expect(table.legBottom).toBeLessThanOrEqual(geo.height);
  });

  it.each(WIDTHS)('keeps its parts in order, top to bottom (%ipx)', (width) => {
    const table = tableGeometry(room(width));
    expect(table.farY).toBeLessThan(table.nearY);
    expect(table.nearY).toBeLessThan(table.apronY);
    expect(table.apronY).toBeLessThan(table.legBottom);
  });
});

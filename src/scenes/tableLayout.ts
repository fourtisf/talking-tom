/**
 * The dining table's measurements, and where the plate sits on it.
 *
 * Phaser-free for the same reason `bathLayout` is, and it answers the same two
 * questions. The table is drawn OVER her, so its far edge is an occluder and
 * everything below it is gone. And the plate is where a half-eaten meal RESTS
 * between bites, so the distance from it to her mouth decides whether hand
 * feeding is still a gesture.
 *
 * That second one is the trap. `FEEDING.openRadius` is 120: a plate closer than
 * that to her mouth has her jaw open before the food has moved, on a target
 * that a release at 79-120px still refuses — mouth open, food flies home, and
 * it reads as the game failing rather than as a miss. The numbers below are set
 * against it, and `tests/kitchen.test.ts` is where the four files that have no
 * reason to know about each other (`rigLayout` puts her mouth, `tuning` sets
 * the radii, `HomeScene` lifts her, this places the plate) are made to agree.
 */

import type { RoomBox } from '@/scenes/bedLayout';

/**
 * How far she sits up out of her standing spot to be at the table.
 *
 * The same move `BATH_PET_RISE` makes, forced by the same kind of arithmetic.
 * At her standing feet-576 the plate lands about 97px from her mouth, well
 * inside the 120 she opens up at. Lifting her — she is on a chair, and the
 * chair is drawn behind her — puts it 155 away instead, and as a bonus drops
 * the band of her the table hides from 80px to 22. Shrinking the table instead
 * would have cost the plate its width, which has nowhere to give: the food is
 * served at `FEEDING.size` 62 and a plate has to be wider than what is on it.
 */
export const TABLE_PET_RISE = 58;

/** The plate, at the size it is drawn. Wider than the 62px morsel it holds. */
export const PLATE_WIDTH = 132;
export const PLATE_HEIGHT = 34;

export interface TableGeometry {
  left: number;
  right: number;
  width: number;
  centreX: number;
  /** The far lip. THIS IS THE OCCLUDER — everything below it is hidden. */
  farY: number;
  /** The near edge of the top. The band between the two is the surface. */
  nearY: number;
  /** Bottom of the apron hanging under the near edge. */
  apronY: number;
  /** Where the legs stop. */
  legBottom: number;
  /** Centre of the plate, on the surface. */
  plateX: number;
  plateY: number;
}

export function tableGeometry(geo: RoomBox): TableGeometry {
  // Wider than the tub — a table you cannot see past the cat is a shelf — but
  // inset from the room so the fridge and the counter still read behind it.
  const width = Math.min(560, geo.width - 44);
  const left = Math.round(geo.width / 2 - width / 2);
  const farY = geo.height - 132;
  const nearY = geo.height - 78;
  return {
    left,
    right: left + width,
    width,
    centreX: Math.round(geo.width / 2),
    farY,
    nearY,
    apronY: nearY + 26,
    legBottom: geo.height - 10,
    plateX: Math.round(geo.width / 2),
    // Just past the middle of the surface band, so the plate reads as sitting
    // ON the table rather than balanced on its far edge.
    plateY: Math.round(farY + (nearY - farY) * 0.52),
  };
}

/**
 * How far above the plate's centre the food is drawn.
 *
 * `FOOD_BOX` bottoms at +56 in a 128-wide box, so at the serve scale the
 * morsel's own floor is ~27 below its origin. Lifting it lands that floor just
 * inside the plate's rim rather than through it — the difference between food
 * IN a dish and food impaled on one.
 *
 * SMALL, and it is the plate's clearance that keeps it small. Every pixel of
 * lift moves the resting meal a pixel nearer her mouth, and at 14 the rest
 * point came within 9px of `FEEDING.openRadius` — close enough that her jaw
 * would hang open at a laid table. `tests/kitchen.test.ts` measures it.
 */
export const FOOD_LIFT = 6;

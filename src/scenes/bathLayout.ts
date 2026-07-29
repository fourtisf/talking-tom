/**
 * The bathtub's measurements.
 *
 * Phaser-free for the same reason the bed's are: the tub's near wall is drawn
 * OVER her so she is sitting in it rather than standing behind it, and that
 * wall hides everything below the water line. Every smudge has to stay above
 * that line or the player is asked to scrub something they cannot see or reach
 * — which is arithmetic, and worth checking without a canvas.
 */

import type { RoomBox } from '@/scenes/bedLayout';

export interface TubGeometry {
  left: number;
  right: number;
  width: number;
  /** The far lip, behind her. */
  rimY: number;
  /** The near edge of the water. */
  waterY: number;
  /**
   * Top of the suds RIDGE floating on the water, which is the real occluder —
   * it is drawn over her and stands proud of the surface. Dirt has to clear
   * this line, not the water line.
   */
  sudsTopY: number;
  /** Top of the near wall. */
  nearTop: number;
  /** Where the tub's body stops and its feet start. */
  bottom: number;
  footY: number;
}

/**
 * How far she sits up out of her standing spot when she is in the bath.
 *
 * A tub deep enough to be a tub is about 140px tall, and standing on the floor
 * she leaves 52 of them. Without this the bath comes out as a long shallow
 * trough with a cat sitting on the rim of it. Lifting her instead of shrinking
 * the tub keeps the tub a tub and puts her INSIDE it.
 */
export const BATH_PET_RISE = 86;

/**
 * How far the suds stand above the water.
 *
 * Shared with the drawing rather than eyeballed twice: the ridge is what
 * actually hides the bottom of her, and a version of this number that only
 * exists inside the draw call is a number the tests cannot see.
 */
export const SUDS_RISE = 29;

export function tubGeometry(geo: RoomBox): TubGeometry {
  // Narrower than the bed on purpose: a bath as wide as a bed is a swimming
  // pool, and the width is what made the first one read as a trough.
  const width = Math.min(430, geo.width - 60);
  const left = Math.round(geo.width / 2 - width / 2);
  /*
   * The water sits at her belly, not her chest.
   *
   * Chest-deep is the prettier picture and it is unplayable: three of the five
   * smudges live on the torso, and a bath that submerges the dirt is a bath you
   * cannot finish. `tests/bathroom.test.ts` holds the line.
   */
  const waterY = geo.height - 138;
  return {
    left,
    right: left + width,
    width,
    rimY: geo.height - 190,
    waterY,
    sudsTopY: waterY - SUDS_RISE,
    // Far enough below the water that a band of it actually SHOWS. At +10 the
    // near wall ate all but ten pixels of the water and the tub came out as a
    // white slab with a blue pinstripe.
    nearTop: geo.height - 108,
    bottom: geo.height - 30,
    footY: geo.height - 12,
  };
}

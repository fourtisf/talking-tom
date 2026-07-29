/**
 * The bed's measurements, and where the cat goes on it.
 *
 * Phaser-free on purpose. The bed shrinks with the screen and she does not, so
 * "does she land on it" is a question about arithmetic across every viewport
 * the game builds for — checkable without a canvas, and invisible in a
 * screenshot of whichever size you happened to open.
 */

/** Only the two fields the bed is measured against. */
export interface RoomBox {
  width: number;
  height: number;
}

/**
 * Where the bed is, in room-column space.
 *
 * Exported because the SLEEPING POSE is laid out against it: `HomeScene` has to
 * put her head on the pillow to the pixel, and two copies of these numbers
 * would drift apart the first time the bed was resized. The one number the
 * scene actually needs is `headX/headY`; everything else is here so the bed and
 * the duvet agree with each other.
 */
export interface BedGeometry {
  left: number;
  right: number;
  width: number;
  /** Top of the mattress. */
  surfaceY: number;
  /** Centre of her head once she is lying down. */
  headX: number;
  headY: number;
}

export function bedGeometry(geo: RoomBox): BedGeometry {
  // She is ~330px long lying down and that does not shrink with the screen, so
  // on a phone the bed takes nearly the whole column. A cat that fills her bed
  // is right; a cat hanging off the end is not.
  const width = Math.min(470, geo.width - 34);
  const left = Math.round(geo.width / 2 - width / 2);
  const surfaceY = geo.height - 158;
  return {
    left,
    right: left + width,
    width,
    surfaceY,
    /*
     * A third of the way down the bed, not up against the headboard.
     *
     * Her head is a 180px ball and the pillow behind it is the only thing that
     * says she is lying on something rather than beside it — pushed to the head
     * of the bed, the pillow is entirely eclipsed and all that is left is a cat
     * in mid-air. This leaves the pillow's whole left end showing.
     */
    headX: left + Math.round(width * 0.33),
    headY: surfaceY - 78,
  };
}

/**
 * Where the duvet starts and stops along the bed, in room space.
 *
 * Pure and exported so the one thing that can silently break it is checkable:
 * she does not shrink with the screen, and on a phone-sized bed a `to` that
 * lands left of `from` folds the whole mound inside out.
 */
export function duvetRun(bed: BedGeometry): { from: number; to: number } {
  return { from: bed.headX + 52, to: bed.right - 28 };
}


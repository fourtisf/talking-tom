/**
 * Lying down: the two angles, and where the root has to be.
 *
 * Phaser-free for the same reason `idlePolicy` is — the placement is solved
 * trigonometry with a sign in it that is easy to get backwards and impossible
 * to spot in a screenshot, because a cat 200px to the WRONG side of the pillow
 * still looks like a cat on a bed until you notice she is off the end of it.
 */

/**
 * The rig is drawn front-on and cannot curl, so sleep is a rotation of the
 * whole cat plus a counter-rotation of the head: the body goes down onto the
 * mattress and the head stays nearly upright, resting on the pillow, which is
 * how a cat asleep on its side is drawn. The two are a pair — the head ends up
 * at -74 + 52 = -22 degrees, a tilt and not a topple.
 *
 * Anything short of about -70 leaves her propped up like an invalid; a full -90
 * lines her spine up with the mattress and reads as a cat that has been placed
 * there rather than one that lay down.
 */
export const SLEEP_ANGLE = -74;
export const SLEEP_HEAD_TILT = 52;

export interface Point {
  x: number;
  y: number;
}

/**
 * The root position that puts her head on the pillow.
 *
 * The rig's root is at her FEET, and at this angle the head is most of a cat
 * away from it — so the pose cannot be placed by eye against the bed, it has to
 * be solved backwards from where the head is wanted. `headLocalY` is the head
 * bone's offset in rig space (negative: up from the feet) and `scale` is the
 * rig's display scale.
 */
export function sleepRoot(head: Point, headLocalY: number, scale: number): Point {
  const rad = (SLEEP_ANGLE * Math.PI) / 180;
  return {
    x: head.x + headLocalY * Math.sin(rad) * scale,
    y: head.y - headLocalY * Math.cos(rad) * scale,
  };
}

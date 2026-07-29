/**
 * Where the muck lands.
 *
 * Its own module, Phaser-free, because two other things have to agree with it:
 * the bathtub's water line must leave every spot above water, and the sleeping
 * pose must not swing one behind the duvet. Both are checkable arithmetic.
 */

/** Bones a smudge can hang off. Only these two are big enough to hold one. */
export type SpotBone = 'body' | 'head';

export interface SpotDef {
  readonly bone: SpotBone;
  /** Position in that bone's own space. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * Worst-first: the first entry appears the moment she starts to look grubby,
 * the last only when she is filthy.
 *
 * Almost all of it is on the torso because almost all of her face is eyes — the
 * whites are 76px across at (+/-50, 18) and the muzzle owns everything below,
 * which leaves the forehead as the only patch of head a smudge can sit on
 * without reading as a black eye.
 *
 * They are also kept off her belly, and not for looks: the bathtub's near wall
 * is drawn over her, so a smudge low enough to fall under the water line is one
 * the player can neither see nor reach. `tests/bathroom.test.ts` checks the
 * lowest one's BOTTOM EDGE, which is what caught this the first time — the
 * centre cleared the water and the blob did not.
 */
export const DIRT_SPOTS: readonly SpotDef[] = [
  { bone: 'body', x: -34, y: -6, size: 46 },
  { bone: 'body', x: 28, y: 18, size: 40 },
  { bone: 'body', x: -10, y: 22, size: 34 },
  { bone: 'head', x: 14, y: -66, size: 34 },
  { bone: 'body', x: 46, y: -22, size: 30 },
];

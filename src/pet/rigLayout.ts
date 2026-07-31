/**
 * The rig's design space: how big the cat is and where each part sits.
 *
 * Split out of `PetArt` and deliberately Phaser-free, for the same reason
 * `idlePolicy` and `sleepPose` are — this is the table the sleeping pose is
 * solved against, and a placement that has drifted puts her head somewhere
 * other than the pillow. That is checkable arithmetic, and it should not need a
 * canvas to check.
 *
 * `PetArt` re-exports everything here, so nothing else has to know about the
 * split.
 */

// Type-only: erased at compile time under `verbatimModuleSyntax`, so this
// file stays free of Phaser and the node tests can still read it.
import type { ArtBox } from '@/ui/bake';


/** Every part the rig knows how to place. Providers must handle all of them. */
export type PartKey =
  | 'tail'
  | 'body'
  | 'armL'
  | 'armR'
  | 'legL'
  | 'legR'
  | 'head'
  | 'earL'
  | 'earR'
  | 'eyeWhiteL'
  | 'eyeWhiteR'
  | 'eyeBallL'
  | 'eyeBallR'
  | 'lidL'
  | 'lidR'
  | 'lashes'
  | 'muzzle'
  | 'nose'
  | 'blush'
  | 'accessory';

/** The named mouth shapes. Expression is a mouth swap, not a body redraw. */
export type MouthShape = 'norm' | 'joy' | 'sad' | 'open' | 'cross';

/** The design space is the prototype's 300x360 viewBox. */
export const DESIGN_WIDTH = 300;
export const DESIGN_HEIGHT = 360;

/** Prototype viewBox coordinate -> rig-local coordinate (origin = feet). */
export function local(x: number, y: number): { x: number; y: number } {
  return { x: x - DESIGN_WIDTH / 2, y: y - DESIGN_HEIGHT };
}

/** Where each part sits in rig space, and what it pivots around. */
export interface PartPlacement {
  x: number;
  y: number;
  /** Rotation origin, in rig space, for parts that swing. */
  pivotX?: number;
  pivotY?: number;
}

/** Head-space anchor the accessory slot hangs off, so hats fit any head. */
export const ACCESSORY_ANCHOR = { x: 0, y: -70 } as const;

/**
 * How far a hat reaches around that anchor. Widest is the headset at x +/-124,
 * tallest the crown at y -110.
 *
 * HERE rather than in `PetArt`, where the rest of the art boxes live, because
 * this one is load bearing outside the drawing code and `PetArt` imports
 * Phaser — which means no test running in node can read it. The photo crop
 * needs it: a hat is NOT inside the rig's 360-tall design box. Anchor -70 from
 * a head at -220 plus a -124 box puts the crown at -414, 54 units out the top,
 * and a crop sized off the design box guillotines it. `PetArt` re-exports this
 * so the art code still reads it from where it expects.
 */
export const ACCESSORY_BOX: ArtBox = { left: -134, top: -124, right: 134, bottom: 100 };

/** Eye radii, shared by the white, the lid and the lid's crease line. */
export const EYE_RX = 31;
export const EYE_RY = 35;
/** The lid overhangs the white slightly so a shut eye leaves no rim showing. */
export const LID_RX = EYE_RX + 3;
export const LID_RY = EYE_RY + 3;

/** Radius of the skull circle. The pose puts this much of her on the mattress. */
export const HEAD_RADIUS = 94;

export const PLACEMENTS: Readonly<Record<PartKey, PartPlacement>> = {
  tail: { ...local(236, 240), pivotX: local(206, 306).x, pivotY: local(206, 306).y },
  body: local(150, 278),
  armL: local(92, 288),
  armR: local(208, 288),
  // High enough that the torso buries their top third — a foot clear of the
  // body reads as a loose blob no matter how it is drawn.
  legL: local(114, 330),
  legR: local(186, 330),
  head: local(150, 140),
  // Head children are positioned relative to the head centre.
  // Ear roots sit ~6px inside the skull arc so the base is buried whatever the
  // twitch does, and far enough apart that the crown tuft never touches them.
  earL: { x: -58, y: -66 },
  earR: { x: 58, y: -66 },
  eyeWhiteL: { x: 100 - 150, y: 158 - 140 },
  eyeWhiteR: { x: 200 - 150, y: 158 - 140 },
  eyeBallL: { x: 101 - 150, y: 162 - 140 },
  eyeBallR: { x: 199 - 150, y: 162 - 140 },
  // Lids hang from the TOP of the eye so scaleY 0..1 reads as an eyelid
  // closing downward rather than an iris being squashed from the middle.
  lidL: { x: 100 - 150, y: 158 - 140 - EYE_RY },
  lidR: { x: 200 - 150, y: 158 - 140 - EYE_RY },
  lashes: { x: 0, y: 0 },
  muzzle: { x: 0, y: 205 - 140 },
  nose: { x: 0, y: 199 - 140 },
  blush: { x: 0, y: 185 - 140 },
  accessory: { ...ACCESSORY_ANCHOR },
};

/** Half the torso ellipse, rig units — what the duvet has to cover. */
export const TORSO_HALF_WIDTH = 64;
/** The other half of it. Clothes are cut to this ellipse; see `OutfitArt`. */
export const TORSO_HALF_HEIGHT = 52;

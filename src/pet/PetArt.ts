/**
 * The art layer. Spec §2.1 / §10 / §15.
 *
 * The cat is a PLACEHOLDER. An illustrator delivers final art, so nothing
 * outside `src/pet/` may know what a part looks like — the rig asks a
 * `PetArtProvider` for a display object per named part and never inspects it.
 *
 * Swapping to delivered art means writing a second provider in this folder
 * (e.g. an atlas-backed one that returns `scene.add.image(0, 0, 'pet', key)`)
 * and handing it to `PetRig`. No scene, UI or system file changes.
 *
 * The design space is the prototype's 300x360 viewBox. `local()` converts a
 * prototype coordinate into rig space, whose origin is between the pet's feet.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { bakeArt, type ArtBox } from '@/ui/bake';

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
export type MouthShape = 'norm' | 'joy' | 'sad' | 'open';

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

/** Eye radii, shared by the white, the lid and the lid's crease line. */
const EYE_RX = 31;
const EYE_RY = 35;
/** The lid overhangs the white slightly so a shut eye leaves no rim showing. */
const LID_RX = EYE_RX + 3;
const LID_RY = EYE_RY + 3;

export const PLACEMENTS: Readonly<Record<PartKey, PartPlacement>> = {
  tail: { ...local(236, 240), pivotX: local(206, 306).x, pivotY: local(206, 306).y },
  body: local(150, 278),
  armL: local(88, 288),
  armR: local(212, 288),
  // Lower than the prototype: at y=324 the body swallowed them whole.
  legL: local(114, 338),
  legR: local(186, 338),
  head: local(150, 140),
  // Head children are positioned relative to the head centre.
  earL: { x: 100 - 150, y: 70 - 140 },
  earR: { x: 200 - 150, y: 70 - 140 },
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

/**
 * Local-space box each part draws into, used to bake it to a texture.
 *
 * Generous by a few pixels so thick strokes are never clipped. Only the
 * placeholder provider needs these; an atlas-backed provider returns Images
 * that are already textures and skips baking entirely.
 */
export const PART_BOX: Readonly<Record<PartKey, ArtBox>> = {
  tail: { left: -56, top: -66, right: 82, bottom: 96 },
  body: { left: -78, top: -72, right: 78, bottom: 72 },
  armL: { left: -28, top: -36, right: 28, bottom: 38 },
  armR: { left: -28, top: -36, right: 28, bottom: 38 },
  legL: { left: -38, top: -28, right: 38, bottom: 28 },
  legR: { left: -38, top: -28, right: 38, bottom: 28 },
  head: { left: -104, top: -142, right: 104, bottom: 104 },
  earL: { left: -50, top: -62, right: 50, bottom: 42 },
  earR: { left: -50, top: -62, right: 50, bottom: 42 },
  eyeWhiteL: { left: -38, top: -42, right: 38, bottom: 42 },
  eyeWhiteR: { left: -38, top: -42, right: 38, bottom: 42 },
  eyeBallL: { left: -26, top: -26, right: 26, bottom: 26 },
  eyeBallR: { left: -26, top: -26, right: 26, bottom: 26 },
  lidL: { left: -40, top: -6, right: 40, bottom: 82 },
  lidR: { left: -40, top: -6, right: 40, bottom: 82 },
  lashes: { left: -108, top: -44, right: 108, bottom: 16 },
  muzzle: { left: -86, top: -32, right: 86, bottom: 32 },
  nose: { left: -14, top: -10, right: 14, bottom: 16 },
  blush: { left: -84, top: -18, right: 84, bottom: 18 },
  accessory: { left: 0, top: 0, right: 0, bottom: 0 },
};

/** One box covers all four mouth shapes; they swap inside the same slot. */
export const MOUTH_BOX: ArtBox = { left: -34, top: -16, right: 34, bottom: 34 };

/**
 * Hats are drawn around the head anchor. One box covers the whole set: the
 * widest is the headset at x +/-124, the tallest the crown at y -110.
 */
export const ACCESSORY_BOX: ArtBox = { left: -134, top: -124, right: 134, bottom: 100 };

/**
 * Contract between the rig and whatever draws the pet.
 *
 * `createPart` returns a display object already drawn around its own local
 * origin — the rig positions it, so the provider must not bake in placement.
 */
export interface PetArtProvider {
  readonly id: string;
  createPart(scene: Phaser.Scene, key: PartKey): Phaser.GameObjects.GameObject;
  /** All four mouths, keyed by shape. The rig toggles visibility between them. */
  createMouths(scene: Phaser.Scene): Record<MouthShape, Phaser.GameObjects.GameObject>;
  /** Hat art for the accessory slot, or null if this provider has none. */
  createAccessory(scene: Phaser.Scene, itemId: string): Phaser.GameObjects.GameObject | null;
}

/* ------------------------------------------------------------------ *
 * Placeholder provider — vector shapes, no asset files
 * ------------------------------------------------------------------ */

const OUTLINE = PALETTE.line;
const OUTLINE_W = 11;

/** Filled + outlined ellipse, sized by radii to match the prototype's rx/ry. */
function ellipse(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: number,
  stroke = OUTLINE,
  strokeWidth = OUTLINE_W,
): void {
  if (strokeWidth > 0) {
    gfx.lineStyle(strokeWidth, stroke, 1);
    gfx.strokeEllipse(x, y, rx * 2, ry * 2);
  }
  gfx.fillStyle(fill, 1);
  gfx.fillEllipse(x, y, rx * 2, ry * 2);
  if (strokeWidth > 0) {
    gfx.lineStyle(strokeWidth, stroke, 1);
    gfx.strokeEllipse(x, y, rx * 2, ry * 2);
  }
}

/** A tapering rounded stroke along a curve — stands in for a thick SVG path. */
function taperedCurve(
  gfx: Phaser.GameObjects.Graphics,
  curve: Phaser.Curves.CubicBezier,
  fromWidth: number,
  toWidth: number,
  color: number,
  steps = 26,
): void {
  gfx.fillStyle(color, 1);
  const points = curve.getPoints(steps);
  points.forEach((point, i) => {
    const width = Phaser.Math.Linear(fromWidth, toWidth, i / (points.length - 1));
    gfx.fillCircle(point.x, point.y, width / 2);
  });
}

class PlaceholderPetArt implements PetArtProvider {
  readonly id = 'placeholder-vector';

  /**
   * Every part is static art on a container that moves, so each one is baked
   * once and reused. The rig still transforms the containers; what goes away is
   * re-tessellating twenty vector parts on every frame.
   */
  createPart(scene: Phaser.Scene, key: PartKey): Phaser.GameObjects.GameObject {
    if (key === 'accessory') {
      // Filled by `createAccessory` when a hat is equipped.
      return scene.add.container(0, 0);
    }
    return bakeArt(scene, `pet:${this.id}:${key}`, PART_BOX[key], (g) => this.paint(g, key));
  }

  private paint(g: Phaser.GameObjects.Graphics, key: PartKey): void {
    switch (key) {
      case 'tail':
        return this.tail(g);
      case 'body':
        return this.body(g);
      case 'armL':
      case 'armR':
        return this.arm(g);
      case 'legL':
      case 'legR':
        return this.leg(g);
      case 'head':
        return this.head(g);
      case 'earL':
        return this.ear(g, -1);
      case 'earR':
        return this.ear(g, 1);
      case 'eyeWhiteL':
      case 'eyeWhiteR':
        return this.eyeWhite(g);
      case 'eyeBallL':
      case 'eyeBallR':
        return this.eyeBall(g);
      case 'lidL':
      case 'lidR':
        return this.lid(g);
      case 'lashes':
        return this.lashes(g);
      case 'muzzle':
        return this.muzzle(g);
      case 'nose':
        return this.nose(g);
      case 'blush':
        return this.blush(g);
      case 'accessory':
        return;
    }
  }

  createMouths(scene: Phaser.Scene): Record<MouthShape, Phaser.GameObjects.GameObject> {
    const bake = (shape: MouthShape, paint: (g: Phaser.GameObjects.Graphics) => void) =>
      bakeArt(scene, `pet:${this.id}:mouth:${shape}`, MOUTH_BOX, paint);
    return {
      norm: bake('norm', (g) => this.mouthNorm(g)),
      joy: bake('joy', (g) => this.mouthJoy(g)),
      sad: bake('sad', (g) => this.mouthSad(g)),
      open: bake('open', (g) => this.mouthOpen(g)),
    };
  }

  createAccessory(scene: Phaser.Scene, itemId: string): Phaser.GameObjects.GameObject | null {
    const draw = HAT_ART[itemId];
    if (!draw) return null;
    return bakeArt(scene, `pet:${this.id}:hat:${itemId}`, ACCESSORY_BOX, draw);
  }

  /* ------------------------------ body ------------------------------ */

  private body(gfx: Phaser.GameObjects.Graphics): void {
    gfx.lineStyle(OUTLINE_W, OUTLINE, 1);
    gfx.strokeEllipse(0, 0, 128, 104);
    gfx.fillStyle(PALETTE.furSh, 1);
    gfx.fillEllipse(0, 0, 128, 104);
    gfx.fillStyle(PALETTE.fur, 1);
    gfx.fillEllipse(-9, -6, 124, 100);

    gfx.fillStyle(PALETTE.pink, 1);
    gfx.lineStyle(10, OUTLINE, 1);
    const belly = new Phaser.Geom.Ellipse(0, 14, 108, 62);
    gfx.fillEllipseShape(belly);
    gfx.strokeEllipseShape(belly);

    gfx.fillStyle(PALETTE.bellyFill, 0.95);
    gfx.fillCircle(-11, 8, 12);
    gfx.fillCircle(11, 8, 12);
    gfx.fillTriangle(-22, 12, 22, 12, 0, 36);
  }

  private arm(gfx: Phaser.GameObjects.Graphics): void {
    ellipse(gfx, 0, 0, 19, 26, PALETTE.fur);
    ellipse(gfx, 0, 14, 15, 13, 0xfbf4fe, OUTLINE, 0);
    // Toe beans. Three little ones and a big pad — the detail that turns a
    // white oval into a paw.
    gfx.fillStyle(PALETTE.inner, 1);
    gfx.fillEllipse(0, 20, 15, 11);
    for (const [x, y] of [
      [-8.5, 10],
      [0, 7.5],
      [8.5, 10],
    ] as const) {
      gfx.fillEllipse(x, y, 7.5, 8);
    }
  }

  private leg(gfx: Phaser.GameObjects.Graphics): void {
    ellipse(gfx, 0, 0, 29, 18, PALETTE.fur);
    gfx.fillStyle(PALETTE.inner, 0.75);
    gfx.fillEllipse(0, 4, 20, 11);
  }

  private tail(gfx: Phaser.GameObjects.Graphics): void {
    // Curve is authored in the tail part's own space: it starts at the hip
    // (the pivot) and sweeps up and back.
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(-30, 66),
      new Phaser.Math.Vector2(48, 74),
      new Phaser.Math.Vector2(56, -22),
      new Phaser.Math.Vector2(0, -40),
    );
    // Fatter at the hip and barely tapering: a thin tail reads as a rat's.
    taperedCurve(gfx, curve, 40, 34, OUTLINE);
    taperedCurve(gfx, curve, 29, 23, PALETTE.fur);
    // Pink tip, tucked into the fur rather than stuck on the end.
    gfx.fillStyle(PALETTE.pink, 1);
    gfx.fillCircle(0, -40, 11);
    gfx.fillStyle(PALETTE.bellyFill, 0.5);
    gfx.fillCircle(-3, -44, 5);
  }

  /* ------------------------------ head ------------------------------ */

  private head(gfx: Phaser.GameObjects.Graphics): void {
    // A single curl of fur on the crown. Drawn first so the head fill buries
    // its base — the cheapest possible "cute" and the thing the placeholder
    // most obviously lacked.
    // Wide at the base and only a little taller than the ears. Narrower than
    // this and it reads as an aerial rather than a piece of the cat.
    const curlUp = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(-32, -84),
      new Phaser.Math.Vector2(-54, -126),
      new Phaser.Math.Vector2(2, -128),
    );
    const curlBack = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(2, -128),
      new Phaser.Math.Vector2(8, -100),
      new Phaser.Math.Vector2(28, -82),
    );
    const tuft = [...curlUp.getPoints(16), ...curlBack.getPoints(16)];
    gfx.fillStyle(PALETTE.fur, 1);
    gfx.lineStyle(9, OUTLINE, 1);
    gfx.fillPoints(tuft, true);
    gfx.strokePoints(tuft, true);

    // Shading is a crescent, made by laying a lighter circle over a shaded one
    // and offsetting it. The prototype clips an offset ellipse to the head; a
    // baked texture has no clip path, and this gets the same read with none.
    gfx.lineStyle(12, OUTLINE, 1);
    gfx.strokeCircle(0, 0, 94);
    gfx.fillStyle(PALETTE.furSh, 1);
    gfx.fillCircle(0, 0, 94);
    gfx.fillStyle(PALETTE.fur, 1);
    gfx.fillCircle(-15, -10, 92);
  }

  private ear(gfx: Phaser.GameObjects.Graphics, dir: -1 | 1): void {
    // Triangle authored around its own base so the perk rotation reads.
    const tip = { x: dir * -8, y: -48 };
    const outerBase = { x: dir * -16, y: 24 };
    const innerBase = { x: dir * 34, y: -6 };

    gfx.lineStyle(12, OUTLINE, 1);
    gfx.strokeTriangle(outerBase.x, outerBase.y, tip.x, tip.y, innerBase.x, innerBase.y);
    gfx.fillStyle(PALETTE.fur, 1);
    gfx.fillTriangle(outerBase.x, outerBase.y, tip.x, tip.y, innerBase.x, innerBase.y);
    gfx.fillStyle(PALETTE.inner, 1);
    gfx.fillTriangle(
      outerBase.x * 0.6,
      outerBase.y * 0.6,
      tip.x * 0.75,
      tip.y * 0.75,
      innerBase.x * 0.62,
      innerBase.y * 0.62,
    );
  }

  private eyeWhite(gfx: Phaser.GameObjects.Graphics): void {
    ellipse(gfx, 0, 0, EYE_RX, EYE_RY, PALETTE.eyeWhite, OUTLINE, 6);
  }

  private eyeBall(gfx: Phaser.GameObjects.Graphics): void {
    gfx.fillStyle(PALETTE.blue, 1);
    gfx.fillCircle(0, 0, 19);
    gfx.fillStyle(PALETTE.irisHi, 0.85);
    gfx.fillCircle(-5, -6, 11);
    gfx.fillStyle(PALETTE.pupil, 1);
    gfx.fillCircle(0, 1, 9.5);
    gfx.fillStyle(PALETTE.white, 1);
    gfx.fillCircle(-8, -12, 10);
    gfx.fillStyle(PALETTE.white, 0.9);
    gfx.fillCircle(9, 14, 5);
  }

  private lid(gfx: Phaser.GameObjects.Graphics): void {
    // Anchored at the top of the eye (see PLACEMENTS): the animator scales Y
    // from 0 (open, collapsed to nothing) to 1 (shut).
    //
    // The fill is fur so a shut eye vanishes into the face exactly as it does
    // in the prototype; the crease arc along the lower edge is what actually
    // reads as a closed eye.
    gfx.fillStyle(PALETTE.fur, 1);
    gfx.fillEllipse(0, LID_RY, LID_RX * 2, LID_RY * 2);
    gfx.lineStyle(5, OUTLINE, 1);
    gfx.beginPath();
    gfx.arc(
      0,
      LID_RY,
      LID_RX,
      Phaser.Math.DegToRad(18),
      Phaser.Math.DegToRad(162),
      false,
    );
    gfx.strokePath();
  }

  private lashes(gfx: Phaser.GameObjects.Graphics): void {
    gfx.lineStyle(6, OUTLINE, 1);
    const strokes: [number, number, number, number][] = [
      [-70, -7, -87, -24],
      [-79, 6, -99, -6],
      [-57, -17, -66, -36],
      [70, -7, 87, -24],
      [79, 6, 99, -6],
      [57, -17, 66, -36],
    ];
    for (const [x1, y1, x2, y2] of strokes) {
      gfx.lineBetween(x1, y1, x2, y2);
    }
  }

  private muzzle(gfx: Phaser.GameObjects.Graphics): void {
    gfx.fillStyle(0xfdf6fb, 1);
    gfx.fillEllipse(0, 0, 80, 50);
    gfx.lineStyle(3.2, OUTLINE, 0.4);
    gfx.lineBetween(-40, -6, -78, -8);
    gfx.lineBetween(-40, 4, -76, 11);
    gfx.lineBetween(40, -6, 78, -8);
    gfx.lineBetween(40, 4, 76, 11);
    // Whisker roots. Tiny, but the muzzle looks blank without them.
    gfx.fillStyle(OUTLINE, 0.45);
    for (const [x, y] of [
      [-25, -7],
      [-31, 2],
      [-22, 9],
      [25, -7],
      [31, 2],
      [22, 9],
    ] as const) {
      gfx.fillCircle(x, y, 2.3);
    }
  }

  private nose(gfx: Phaser.GameObjects.Graphics): void {
    gfx.fillStyle(PALETTE.pink, 1);
    gfx.lineStyle(3.6, OUTLINE, 1);
    gfx.fillTriangle(-8, -3, 8, -3, 0, 9);
    gfx.strokeTriangle(-8, -3, 8, -3, 0, 9);
  }

  private blush(gfx: Phaser.GameObjects.Graphics): void {
    gfx.fillStyle(PALETTE.blushFill, 1);
    gfx.fillEllipse(-57, 0, 42, 24);
    gfx.fillEllipse(57, 0, 42, 24);
  }

  /* ----------------------------- mouths ----------------------------- */

  /**
   * Mouth coordinates are the prototype's SVG paths, rebased so y = 0 is the
   * muzzle centre (SVG y 205). Quadratic curves, same control points.
   */
  private curve(
    gfx: Phaser.GameObjects.Graphics,
    from: [number, number],
    control: [number, number],
    to: [number, number],
  ): void {
    new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(from[0], from[1]),
      new Phaser.Math.Vector2(control[0], control[1]),
      new Phaser.Math.Vector2(to[0], to[1]),
    ).draw(gfx, 18);
  }

  private mouthNorm(gfx: Phaser.GameObjects.Graphics): void {
    gfx.lineStyle(5, OUTLINE, 1);
    gfx.lineBetween(0, 1, 0, 4);
    this.curve(gfx, [0, 4], [-12, 19], [-23, 2]);
    this.curve(gfx, [0, 4], [12, 19], [23, 2]);
  }

  private mouthJoy(gfx: Phaser.GameObjects.Graphics): void {
    gfx.lineStyle(5, OUTLINE, 1);
    gfx.lineBetween(0, 0, 0, 3);
    this.curve(gfx, [-23, 5], [0, 28], [23, 5]);
  }

  private mouthSad(gfx: Phaser.GameObjects.Graphics): void {
    gfx.lineStyle(5, OUTLINE, 1);
    gfx.lineBetween(0, 1, 0, 5);
    this.curve(gfx, [-11, 21], [0, 10], [11, 21]);
  }

  private mouthOpen(gfx: Phaser.GameObjects.Graphics): void {
    gfx.fillStyle(PALETTE.mouthInner, 1);
    gfx.lineStyle(4.5, OUTLINE, 1);
    gfx.fillEllipse(0, 13, 32, 24);
    gfx.strokeEllipse(0, 13, 32, 24);
  }
}

/* ------------------------------------------------------------------ *
 * Placeholder hat art, keyed by the ids in `tuning.HATS`
 * ------------------------------------------------------------------ */

type HatDraw = (gfx: Phaser.GameObjects.Graphics) => void;

const HAT_ART: Readonly<Record<string, HatDraw>> = {
  bloom: (gfx) => {
    const petals: [number, number][] = [
      [56, -14],
      [86, -4],
      [76, 26],
      [42, 18],
    ];
    gfx.fillStyle(0xff9fb0, 1);
    gfx.lineStyle(8, 0x33243f, 1);
    for (const [x, y] of petals) {
      gfx.fillCircle(x, y, 19);
      gfx.strokeCircle(x, y, 19);
    }
    gfx.fillStyle(PALETTE.butter, 1);
    gfx.lineStyle(7, 0x33243f, 1);
    gfx.fillCircle(66, 6, 14);
    gfx.strokeCircle(66, 6, 14);
  },
  beanie: (gfx) => {
    gfx.fillStyle(0x4ed6a0, 1);
    gfx.lineStyle(11, 0x33243f, 1);
    gfx.beginPath();
    gfx.arc(0, 14, 96, Phaser.Math.DegToRad(190), Phaser.Math.DegToRad(350), false);
    gfx.closePath();
    gfx.fillPath();
    gfx.strokePath();
    gfx.fillStyle(0x2fb07f, 1);
    gfx.fillRoundedRect(-98, 2, 196, 26, 13);
    gfx.strokeRoundedRect(-98, 2, 196, 26, 13);
  },
  party: (gfx) => {
    gfx.fillStyle(0xff6b6b, 1);
    gfx.lineStyle(11, 0x33243f, 1);
    gfx.fillTriangle(0, -84, 50, 16, -50, 16);
    gfx.strokeTriangle(0, -84, 50, 16, -50, 16);
    gfx.fillStyle(PALETTE.butter, 1);
    gfx.lineStyle(9, 0x33243f, 1);
    gfx.fillCircle(0, -86, 14);
    gfx.strokeCircle(0, -86, 14);
    gfx.fillStyle(0xfff7ec, 1);
    gfx.fillCircle(-18, -8, 7);
    gfx.fillCircle(16, -30, 7);
  },
  chef: (gfx) => {
    gfx.fillStyle(0xfff7ec, 1);
    gfx.lineStyle(11, 0x33243f, 1);
    for (const [x, y, rx, ry] of [
      [-44, -36, 34, 31],
      [44, -36, 34, 31],
      [0, -54, 40, 36],
    ] as const) {
      gfx.fillEllipse(x, y, rx * 2, ry * 2);
      gfx.strokeEllipse(x, y, rx * 2, ry * 2);
    }
    gfx.fillRoundedRect(-60, -18, 120, 42, 14);
    gfx.strokeRoundedRect(-60, -18, 120, 42, 14);
  },
  cans: (gfx) => {
    gfx.lineStyle(16, 0x33243f, 1);
    gfx.beginPath();
    gfx.arc(0, 18, 98, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
    gfx.strokePath();
    gfx.fillStyle(0xff6b6b, 1);
    gfx.lineStyle(11, 0x33243f, 1);
    for (const x of [-101, 101]) {
      gfx.fillRoundedRect(x - 23, 24, 46, 62, 22);
      gfx.strokeRoundedRect(x - 23, 24, 46, 62, 22);
    }
  },
  crown: (gfx) => {
    const points = [
      new Phaser.Geom.Point(-88, -2),
      new Phaser.Geom.Point(-82, -92),
      new Phaser.Geom.Point(-42, -54),
      new Phaser.Geom.Point(0, -110),
      new Phaser.Geom.Point(42, -54),
      new Phaser.Geom.Point(82, -92),
      new Phaser.Geom.Point(88, -2),
    ];
    gfx.fillStyle(PALETTE.butter, 1);
    gfx.lineStyle(11, 0x33243f, 1);
    gfx.fillPoints(points, true);
    gfx.strokePoints(points, true);
    gfx.fillStyle(0xff6b6b, 1);
    gfx.lineStyle(7, 0x33243f, 1);
    gfx.fillCircle(0, -38, 12);
    gfx.strokeCircle(0, -38, 12);
  },
};

export const placeholderPetArt: PetArtProvider = new PlaceholderPetArt();

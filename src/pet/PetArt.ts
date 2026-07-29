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

/**
 * The iris all but fills the white — inscribed in it, given the eyeball sits 4px
 * lower than the white (see PLACEMENTS), so only a crescent shows along the top.
 */
const IRIS_RX = 28;
const IRIS_RY = 30;

/**
 * Where the light comes from, matching the landing page's `#iris` radial
 * gradient (cx 38%, cy 30% — so up and to the left of centre).
 */
const IRIS_FOCUS_X = -7;
const IRIS_FOCUS_Y = -12;
/** Bands in the stepped gradient. Baked once, so the count is free. */
const IRIS_STEPS = 14;
/** Gradient stop at 55%, again matching the landing page. */
const IRIS_MID = 0.55;

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

/**
 * Local-space box each part draws into, used to bake it to a texture.
 *
 * Generous by a few pixels so thick strokes are never clipped. Only the
 * placeholder provider needs these; an atlas-backed provider returns Images
 * that are already textures and skips baking entirely.
 */
export const PART_BOX: Readonly<Record<PartKey, ArtBox>> = {
  tail: { left: -58, top: -90, right: 90, bottom: 98 },
  // Top grown for the chest ruff, which rises above the torso ellipse.
  body: { left: -78, top: -84, right: 78, bottom: 72 },
  armL: { left: -28, top: -36, right: 28, bottom: 38 },
  armR: { left: -28, top: -36, right: 28, bottom: 38 },
  legL: { left: -40, top: -31, right: 40, bottom: 31 },
  legR: { left: -40, top: -31, right: 40, bottom: 31 },
  head: { left: -104, top: -142, right: 104, bottom: 104 },
  earL: { left: -48, top: -68, right: 48, bottom: 42 },
  earR: { left: -48, top: -68, right: 48, bottom: 42 },
  eyeWhiteL: { left: -38, top: -42, right: 38, bottom: 42 },
  eyeWhiteR: { left: -38, top: -42, right: 38, bottom: 42 },
  // Grown with the iris. Art drawn outside its box is clipped by the bake, and
  // at the old ±26 the enlarged iris lost its edge silently.
  eyeBallL: { left: -32, top: -34, right: 32, bottom: 34 },
  eyeBallR: { left: -32, top: -34, right: 32, bottom: 34 },
  lidL: { left: -40, top: -6, right: 40, bottom: 82 },
  lidR: { left: -40, top: -6, right: 40, bottom: 82 },
  lashes: { left: -108, top: -44, right: 108, bottom: 16 },
  muzzle: { left: -56, top: -34, right: 56, bottom: 38 },
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
/**
 * Stroke width for the whole silhouette. Every part strokes at this width and
 * then fills over it, so exactly half shows and the outline weighs the same on
 * the torso as on the head — the character has one edge, not three.
 */
const OUTLINE_W = 12;

/** Outlined ellipse: stroke, then fill over the inner half of the stroke. */
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
}

/** Points along an ellipse arc. Degrees, y down, 0 = +x, 90 = straight down. */
function arcPoints(
  rx: number,
  ry: number,
  fromDeg: number,
  toDeg: number,
  steps = 40,
): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Phaser.Math.DegToRad(Phaser.Math.Linear(fromDeg, toDeg, i / steps));
    pts.push(new Phaser.Math.Vector2(rx * Math.cos(a), ry * Math.sin(a)));
  }
  return pts;
}

/**
 * An outline that dies away at both ends.
 *
 * Where a limb meets the body a closed outline reads as a mitten laid on the
 * belly rather than an arm; letting the line fade out as it enters the torso is
 * what merges the two silhouettes. Drawn as discs so the taper is smooth —
 * Phaser strokes have one width per path.
 */
function fadingOutline(
  gfx: Phaser.GameObjects.Graphics,
  points: Phaser.Math.Vector2[],
  width = OUTLINE_W,
  fade = 0.14,
  color = OUTLINE,
): void {
  gfx.fillStyle(color, 1);
  const last = points.length - 1;
  points.forEach((point, i) => {
    const u = i / last;
    const t = Math.min(1, Math.min(u, 1 - u) / fade);
    if (t > 0) gfx.fillCircle(point.x, point.y, (width * t) / 2);
  });
}

/** Linear blend between two packed 0xRRGGBB colours. `t` runs 0 -> `a`, 1 -> `b`. */
function mixColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * k);
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * k);
  const bl = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * k);
  return (r << 16) | (g << 8) | bl;
}

/**
 * Fur ramp, lit to deepest.
 *
 * A pure white cat cannot carry a highlight, so the body tone is pulled a
 * fraction off white and `FUR_LIT` is the real white kept back for the gleam.
 * Four flat steps, no gradients: this is a vector style.
 */
const FUR_LIT = PALETTE.fur;
const FUR = mixColor(PALETTE.fur, PALETTE.furSh, 0.42);
const FUR_SH = PALETTE.furSh;
const FUR_DEEP = PALETTE.furSh2;

/**
 * The chest ruff's top edge, in body-part space. An arch of soft tufts whose
 * ends land on the torso ellipse, so the ruff joins the body outline instead of
 * sprouting from it.
 */
const RUFF_HALF_W = 56;
const BODY_RUFF: Phaser.Math.Vector2[] = Array.from({ length: 73 }, (_, i) => {
  const u = i / 72;
  return new Phaser.Math.Vector2(
    Phaser.Math.Linear(-RUFF_HALF_W, RUFF_HALF_W, u),
    // The tuft term is scaled by the arch so the ruff leaves the torso edge
    // smoothly instead of erupting into a lump at the shoulder.
    -26 - Math.sin(Math.PI * u) * (28 + 12 * Math.abs(Math.sin(Math.PI * u * 4))),
  );
});

/**
 * Stretches of the skull outline that get stroked, in degrees (y down, 0 = +x).
 * The two gaps are where the ear shells cross the head circle, pulled a few
 * degrees inside the crossing so a twitching ear still covers the opening.
 */
const SKULL_ARCS: readonly (readonly [number, number])[] = [
  [322.4, 577.6],
  [245.9, 294.1],
];

/**
 * Stretches of the torso outline that get stroked, same idea as `SKULL_ARCS`:
 * the gaps are where the two feet cross it, so a foot joins the body instead of
 * being an outlined blob with a second line drawn across its top.
 */
const TORSO_ARCS: readonly (readonly [number, number])[] = [
  [82.7, 97.3],
  [138.3, 401.7],
];

/** A tapering rounded stroke along a curve — stands in for a thick SVG path. */
function taperedCurve(
  gfx: Phaser.GameObjects.Graphics,
  curve: Phaser.Curves.Curve,
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
        return this.arm(g, -1);
      case 'armR':
        return this.arm(g, 1);
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
    for (const [from, to] of TORSO_ARCS) {
      gfx.strokePoints(arcPoints(64, 52, from, to, 60), false);
    }
    // Two flat tones. The lit ellipse is inset up-left, which leaves shade
    // under the chin and down the right flank in one move.
    gfx.fillStyle(FUR_SH, 1);
    gfx.fillEllipse(0, 0, 128, 104);
    gfx.fillStyle(FUR, 1);
    gfx.fillEllipse(-4, 6, 118, 88);

    // Chest ruff. The head circle and the torso ellipse cross at a notch on
    // each shoulder; the ruff fills it so the two read as one animal.
    const skirt = [
      ...BODY_RUFF,
      new Phaser.Math.Vector2(RUFF_HALF_W, 26),
      new Phaser.Math.Vector2(-RUFF_HALF_W, 26),
    ];
    fadingOutline(gfx, BODY_RUFF, OUTLINE_W, 0.05);
    gfx.fillStyle(FUR_SH, 1);
    gfx.fillPoints(skirt, true);
    gfx.fillStyle(FUR_LIT, 1);
    gfx.fillPoints(
      skirt.map((p) => new Phaser.Math.Vector2(p.x, p.y + 13)),
      true,
    );

    // Belly marking: no outline and a chest blaze running up under the chin,
    // so it reads as fur rather than a bib laid over the cat.
    gfx.fillStyle(PALETTE.pink, 1);
    gfx.fillEllipse(0, -9, 46, 44);
    gfx.fillEllipse(0, 12, 66, 60);

    gfx.fillStyle(PALETTE.bellyFill, 0.95);
    gfx.fillCircle(-9, 5, 9.5);
    gfx.fillCircle(9, 5, 9.5);
    gfx.fillTriangle(-17.5, 8, 17.5, 8, 0, 27);
  }

  private arm(gfx: Phaser.GameObjects.Graphics, dir: -1 | 1): void {
    const rx = 20;
    const ry = 27;
    // Outlined only on the arc that clears the torso, and fading at both ends.
    // A closed ring here is what made the arms read as handles.
    const outer = arcPoints(rx, ry, -105, 140).map(
      (p) => new Phaser.Math.Vector2(p.x * dir, p.y),
    );
    fadingOutline(gfx, outer);
    gfx.fillStyle(FUR_SH, 1);
    gfx.fillEllipse(0, 0, rx * 2, ry * 2);
    gfx.fillStyle(FUR, 1);
    gfx.fillEllipse(dir * 2, 3, rx * 2 - 8, ry * 2 - 9);
    // The paw's underside catches the light.
    gfx.fillStyle(FUR_LIT, 1);
    gfx.fillEllipse(0, 13, 30, 26);
    // Toe beans. Three little ones and a big pad — the detail that turns a
    // white oval into a paw.
    gfx.fillStyle(PALETTE.inner, 1);
    gfx.fillEllipse(0, 19, 17, 12);
    for (const [x, y] of [
      [-8.5, 9],
      [0, 6],
      [8.5, 9],
    ] as const) {
      gfx.fillEllipse(x, y, 8, 8.5);
    }
  }

  private leg(gfx: Phaser.GameObjects.Graphics): void {
    // Drawn behind the torso, which buries the top third — that overlap, not
    // the outline, is what stops a foot reading as a loose blob.
    ellipse(gfx, 0, 0, 30, 21, FUR_SH);
    gfx.fillStyle(FUR, 1);
    gfx.fillEllipse(-2, 3, 54, 34);
    gfx.fillStyle(FUR_LIT, 1);
    gfx.fillEllipse(0, 7, 44, 24);
    gfx.fillStyle(PALETTE.inner, 1);
    gfx.fillEllipse(0, 10, 20, 12);
    for (const [x, y] of [
      [-11, 1],
      [0, -1.5],
      [11, 1],
    ] as const) {
      gfx.fillEllipse(x, y, 8.5, 8);
    }
  }

  private tail(gfx: Phaser.GameObjects.Graphics): void {
    // Curve is authored in the tail part's own space: it starts at the hip
    // (the pivot) and sweeps up and back.
    const curve = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(-30, 66),
      new Phaser.Math.Vector2(56, 78),
      new Phaser.Math.Vector2(76, -30),
      new Phaser.Math.Vector2(16, -60),
    );
    // Fat at the hip, tapering to a rounded tip. The outline keeps the same 6px
    // it has everywhere else, so the gap between the two passes stays constant.
    taperedCurve(gfx, curve, 42, 22, OUTLINE, 40);
    taperedCurve(gfx, curve, 30, 10, FUR, 40);
    // Lit pass ridden along the inside of the sweep, not down the middle.
    const lit = new Phaser.Curves.CubicBezier(
      new Phaser.Math.Vector2(-32, 60),
      new Phaser.Math.Vector2(50, 71),
      new Phaser.Math.Vector2(69, -28),
      new Phaser.Math.Vector2(14, -57),
    );
    taperedCurve(gfx, lit, 19, 6, FUR_LIT, 40);
  }

  /* ------------------------------ head ------------------------------ */

  private head(gfx: Phaser.GameObjects.Graphics): void {
    // The skull outline is drawn in two arcs, leaving a gap where each ear
    // crosses it. Ears sit behind the head, so an unbroken circle laid a dark
    // seam across both ear bases — which is what made them read as flaps
    // stapled on rather than ears growing out of the skull.
    gfx.lineStyle(OUTLINE_W, OUTLINE, 1);
    for (const [from, to] of SKULL_ARCS) {
      gfx.beginPath();
      gfx.arc(0, 0, 94, Phaser.Math.DegToRad(from), Phaser.Math.DegToRad(to), false);
      gfx.strokePath();
    }

    // Shading is a stack of offset circles: each lighter tone inset up and to
    // the left leaves the one below showing as a crescent down the right. The
    // prototype clips an offset ellipse to the head; a baked texture has no
    // clip path, and this gets the same read with none.
    // Every tone circle is sized so its offset centre still leaves it inside
    // r=94: an inset circle that pokes out the far side paints over the ear
    // behind the head and eats its own outline.
    gfx.fillStyle(FUR_DEEP, 1);
    gfx.fillCircle(0, 0, 94);
    gfx.fillStyle(FUR_SH, 1);
    gfx.fillCircle(-2, -4, 89.5);
    gfx.fillStyle(FUR, 1);
    gfx.fillCircle(-5, -10, 82.8);

    // Gleam on the crown, cut back to a crescent by a second circle so it hugs
    // the upper-left rim instead of sitting on the head as a blob.
    gfx.fillStyle(FUR_LIT, 1);
    gfx.fillCircle(-19, -27, 59);
    gfx.fillStyle(FUR, 1);
    gfx.fillCircle(-10, -12, 57);

    // NO CROWN TUFT, deliberately — three shapes were tried and each failed the
    // same way. A fur-filled shape on a fur-filled skull is visible only by its
    // outline, so a low tuft is all line and no body and reads as a scratch on
    // the head, while one tall enough to have body between two ears is counted
    // as a third ear. The ears carry the silhouette instead. If a tuft is ever
    // wanted, it has to be a bulge in the head contour itself, not a shape laid
    // over it.
  }

  private ear(gfx: Phaser.GameObjects.Graphics, dir: -1 | 1): void {
    // Authored outward-positive and mirrored, so the two ears are one shape.
    // The base chord is buried inside the skull and never stroked; what shows
    // is a soft leaf with a rounded tip that leans in over the head.
    const p = (x: number, y: number) => new Phaser.Math.Vector2(dir * x, y);
    const edge = (
      from: Phaser.Math.Vector2,
      control: Phaser.Math.Vector2,
      to: Phaser.Math.Vector2,
    ) => new Phaser.Curves.QuadraticBezier(from, control, to).getPoints(14);

    const shell = [
      ...edge(p(-34, 20), p(-28, -16), p(-11, -44)),
      ...edge(p(-11, -44), p(4, -58), p(19, -38)),
      ...edge(p(19, -38), p(28, -4), p(12, 28)),
    ];
    gfx.lineStyle(OUTLINE_W, OUTLINE, 1);
    gfx.strokePoints(shell, true);
    gfx.fillStyle(FUR, 1);
    gfx.fillPoints(shell, true);

    // Inner ear is the same outline scaled toward the base, so the pink
    // follows the shell rather than being a second, unrelated triangle.
    const anchor = p(1, 13);
    gfx.fillStyle(PALETTE.inner, 1);
    gfx.fillPoints(
      shell.map(
        (v) =>
          new Phaser.Math.Vector2(
            anchor.x + (v.x - anchor.x) * 0.66,
            anchor.y + (v.y - anchor.y) * 0.66,
          ),
      ),
      true,
    );
  }

  private eyeWhite(gfx: Phaser.GameObjects.Graphics): void {
    // Unstroked. A dark ring around a white oval, twice, on a white face reads
    // as a pair of spectacles. The fur is white, so the iris is the only edge
    // the eye needs.
    ellipse(gfx, 0, 0, EYE_RX, EYE_RY, PALETTE.eyeWhite, OUTLINE, 0);
  }

  private eyeBall(gfx: Phaser.GameObjects.Graphics): void {
    // A stepped radial gradient. Graphics has no gradient fill, and faking one
    // with a single inset ellipse leaves a hard rim — which is the ring the
    // outline was just removed to be rid of. Concentric bands migrating toward
    // the light instead fade the edge out with nothing to trace. The part is
    // baked to a texture once, so the band count costs nothing per frame.
    for (let i = 0; i < IRIS_STEPS; i++) {
      const s = 1 - i / IRIS_STEPS;
      const color =
        s >= IRIS_MID
          ? mixColor(PALETTE.blue, PALETTE.blueLo, (s - IRIS_MID) / (1 - IRIS_MID))
          : mixColor(PALETTE.irisHi, PALETTE.blue, s / IRIS_MID);
      gfx.fillStyle(color, 1);
      gfx.fillEllipse(
        IRIS_FOCUS_X * (1 - s),
        IRIS_FOCUS_Y * (1 - s),
        IRIS_RX * 2 * s,
        IRIS_RY * 2 * s,
      );
    }

    // The pupil is a bit under a third of the iris. At half of it the eye reads
    // as a black hole with a white dot in it; leaving more blue on show is what
    // makes it look wet and alive rather than doll-like.
    gfx.fillStyle(PALETTE.pupil, 1);
    gfx.fillCircle(0, 3, 10.5);
    // Far enough out to clip the pupil's edge rather than bite its centre: an
    // overlapping catchlight leaves the pupil a lopsided comma, not a disc.
    gfx.fillStyle(PALETTE.white, 1);
    gfx.fillCircle(-12, -12, 8.5);
    gfx.fillStyle(PALETTE.white, 0.92);
    gfx.fillCircle(12, 15, 5);
  }

  private lid(gfx: Phaser.GameObjects.Graphics): void {
    // Anchored at the top of the eye (see PLACEMENTS): the animator scales Y
    // from 0 (open, collapsed to nothing) to 1 (shut).
    //
    // The fill is fur so a shut eye vanishes into the face exactly as it does
    // in the prototype; the crease arc along the lower edge is what actually
    // reads as a closed eye.
    gfx.fillStyle(FUR, 1);
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
    // Tapered, not slabs. At a flat 6px these read as angry eyebrows and pulled
    // more weight than the whiskers below them, inverting the emphasis.
    //
    // Rooted on the IRIS rim, not the eye white's. The white is invisible
    // against white fur, so a lash starting at its edge leaves a gap between
    // itself and the visible eye — and a short dark stroke floating above an eye
    // is exactly what a raised eyebrow looks like. Touching the iris makes them
    // lashes.
    //
    // TWO per side, both sweeping OUT from the eye's outer corner. A third
    // rising steeply from the top of the eye is not a lash — it is an eyebrow,
    // and an angled one over a sad mouth is a scowl.
    //
    // Roots are ON the iris rim, computed from it rather than eyeballed: the
    // eyeball sits at (-49, 22) with radii 28x30, so the up-left rim is about
    // (-70, 3) and the outer rim about (-75, 12). Start a lash even a few px
    // clear of that and a band of white fur shows between it and the eye — at
    // which point it stops reading as a lash and starts reading as a scratch.
    // Tips stay INSIDE the skull (radius 94). A lash that reaches the head
    // outline merges with it and reads as a crack in the face.
    for (const [ax, ay, cx, cy, bx, by] of [
      [-70, 2, -77, -6, -85, -15],
      [-75, 12, -82, 8, -89, 5],
    ] as const) {
      for (const dir of [-1, 1] as const) {
        taperedCurve(
          gfx,
          new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(ax * dir, ay),
            new Phaser.Math.Vector2(cx * dir, cy),
            new Phaser.Math.Vector2(bx * dir, by),
          ),
          // Not hair-thin at the tip: a lash that fades to nothing looks like a
          // stray scratch rather than a deliberate mark.
          5.6,
          2.2,
          OUTLINE,
          34,
        );
      }
    }
  }

  private muzzle(gfx: Phaser.GameObjects.Graphics): void {
    // Two cheek lobes rather than one flat oval, with a shadow under them so
    // the muzzle sits proud of the face instead of being a pale smear.
    gfx.fillStyle(FUR_SH, 1);
    gfx.fillEllipse(0, 5, 82, 50);
    gfx.fillStyle(0xfdf6fb, 1);
    gfx.fillEllipse(-19, 0, 52, 44);
    gfx.fillEllipse(19, 0, 52, 44);
    gfx.fillEllipse(0, -4, 62, 34);

    // NO LONG WHISKERS, deliberately. Six strokes reaching past the cheeks put
    // more dark line on the face than the eyes carry, and they cross the head
    // outline into the background, which reads as scratches rather than fur.
    // The face is cleaner without them; only the roots stay.
    // No whisker roots either. Six grey specks on a white muzzle read as grit
    // at any size above a thumbnail; the nose and the mouth carry the muzzle on
    // their own.
  }

  private nose(gfx: Phaser.GameObjects.Graphics): void {
    // Rounded off the corners: a bare triangle reads as a beak at this size.
    const shape = [
      new Phaser.Math.Vector2(-9, -4),
      new Phaser.Math.Vector2(9, -4),
      new Phaser.Math.Vector2(7, 2),
      new Phaser.Math.Vector2(0, 9.5),
      new Phaser.Math.Vector2(-7, 2),
    ];
    gfx.lineStyle(3.6, OUTLINE, 1);
    gfx.strokePoints(shape, true);
    gfx.fillStyle(PALETTE.pink, 1);
    gfx.fillPoints(shape, true);
    gfx.fillStyle(PALETTE.bellyFill, 0.75);
    gfx.fillEllipse(-3, -1, 6, 3.4);
  }

  private blush(gfx: Phaser.GameObjects.Graphics): void {
    // Feathered, not a flat patch. A hard pink edge stopping dead against white
    // fur reads as a sticker on the cheek; fading it out over several opaque
    // steps leaves no boundary to see. Opaque steps rather than alpha layers,
    // because overlapping alpha double-blends and darkens the core.
    const STEPS = 10;
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      // Squared, so the colour holds near fur across the outer rings and only
      // gathers into pink at the core. A linear ramp still shows a visible ring.
      gfx.fillStyle(mixColor(FUR, PALETTE.blushFill, t * t), 1);
      const s = 1 - t * 0.5;
      for (const dir of [-1, 1] as const) {
        gfx.fillEllipse(57 * dir, 0, 56 * s, 32 * s);
      }
    }
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
    // Shallow. A deep frown under heavy lids does not read as "needs feeding",
    // it reads as crying — and a pet that looks distressed is one players close
    // the app on rather than one they help.
    gfx.lineStyle(5, OUTLINE, 1);
    gfx.lineBetween(0, 1, 0, 5);
    this.curve(gfx, [-10, 18], [0, 12], [10, 18]);
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
  /**
   * The gem rack. These four are bought with the levelling currency rather
   * than the playing one, so they are drawn to read as *earned*: brighter
   * accents, and one idea each rather than a pile of detail that would turn to
   * mush at the 0.26 scale the shop card renders them at.
   *
   * Everything stays inside ACCESSORY_BOX (±134 wide, -124 up) — `bakeArt`
   * CLIPS to that box rather than growing it, so a tall hat silently loses its
   * top instead of failing loudly.
   */
  halo: (gfx) => {
    // Sits above the head with nothing touching it, which is the whole joke.
    gfx.lineStyle(13, 0xf2c14a, 1);
    gfx.strokeEllipse(0, -84, 132, 40);
    gfx.lineStyle(7, PALETTE.butter, 1);
    gfx.strokeEllipse(0, -87, 128, 34);
    // A glint on the near edge, so the ring reads as a solid object rather
    // than a flat outline drawn on the background.
    gfx.lineStyle(6, 0xfff3cf, 1);
    gfx.beginPath();
    gfx.arc(0, -87, 64, Phaser.Math.DegToRad(196), Phaser.Math.DegToRad(250), false);
    gfx.strokePath();
  },
  wizard: (gfx) => {
    const brim: Phaser.Math.Vector2[] = [
      new Phaser.Math.Vector2(-116, 16),
      new Phaser.Math.Vector2(116, 16),
      new Phaser.Math.Vector2(96, 34),
      new Phaser.Math.Vector2(-96, 34),
    ];
    // Cone first, brim over it: the seam where they meet is what makes it a
    // hat sitting ON something rather than two shapes side by side.
    gfx.fillStyle(PALETTE.grapeLo, 1);
    gfx.lineStyle(11, 0x33243f, 1);
    gfx.beginPath();
    gfx.moveTo(-64, 20);
    gfx.lineTo(-18, -108);
    gfx.lineTo(26, -104);
    gfx.lineTo(72, 20);
    gfx.closePath();
    gfx.fillPath();
    gfx.strokePath();

    gfx.fillStyle(PALETTE.grape, 1);
    gfx.fillPoints(brim, true);
    gfx.strokePoints(brim, true);

    gfx.fillStyle(PALETTE.butter, 1);
    gfx.lineStyle(6, 0x33243f, 1);
    for (const [x, y, r] of [
      [-24, -60, 11],
      [16, -22, 9],
      [-40, -14, 7],
    ] as const) {
      gfx.fillCircle(x, y, r);
      gfx.strokeCircle(x, y, r);
    }
  },
  astro: (gfx) => {
    // Bowl, then visor, then one specular streak. The streak is doing most of
    // the work — without it the visor reads as a hole cut in the helmet.
    gfx.fillStyle(0xe9eef7, 1);
    gfx.lineStyle(11, 0x33243f, 1);
    gfx.beginPath();
    gfx.arc(0, 6, 116, Phaser.Math.DegToRad(182), Phaser.Math.DegToRad(358), false);
    gfx.closePath();
    gfx.fillPath();
    gfx.strokePath();

    gfx.fillStyle(0x2e5f8a, 1);
    gfx.lineStyle(9, 0x33243f, 1);
    gfx.fillEllipse(0, -28, 168, 96);
    gfx.strokeEllipse(0, -28, 168, 96);

    gfx.fillStyle(PALETTE.sky, 0.85);
    gfx.fillEllipse(-34, -44, 62, 34);
    gfx.fillStyle(0xffffff, 0.9);
    gfx.fillEllipse(-44, -50, 26, 15);

    // Antenna, kept short so it clears the top of the box.
    gfx.lineStyle(9, 0x33243f, 1);
    gfx.beginPath();
    gfx.moveTo(84, -74);
    gfx.lineTo(102, -104);
    gfx.strokePath();
    gfx.fillStyle(PALETTE.coral, 1);
    gfx.lineStyle(6, 0x33243f, 1);
    gfx.fillCircle(104, -110, 12);
    gfx.strokeCircle(104, -110, 12);
  },
  rainbow: (gfx) => {
    // Six concentric arcs drawn outside-in, so each one's stroke covers the
    // inner edge of the last and the bands meet with no gap.
    const bands = [
      0xff6b6b, 0xffa94d, PALETTE.butter, PALETTE.mint, PALETTE.sky, PALETTE.grape,
    ] as const;
    gfx.lineStyle(13, 0x33243f, 1);
    gfx.beginPath();
    gfx.arc(0, 30, 118, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
    gfx.strokePath();

    bands.forEach((colour, i) => {
      gfx.lineStyle(16, colour, 1);
      gfx.beginPath();
      gfx.arc(0, 30, 110 - i * 15, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
      gfx.strokePath();
    });

    gfx.fillStyle(0xfff7ec, 1);
    gfx.lineStyle(6, 0x33243f, 1);
    for (const [x, y] of [
      [-118, 34],
      [118, 34],
    ] as const) {
      gfx.fillCircle(x, y, 15);
      gfx.strokeCircle(x, y, 15);
    }
  },

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

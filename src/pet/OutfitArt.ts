/**
 * Clothes for the second wearable slot.
 *
 * Split out of `PetArt` rather than added to it: that file is already the
 * longest in the project and the hats alone run to two hundred lines. Nothing
 * here is imported by anything except `PetArt.createOutfit` and the shop card.
 *
 * DRAWN IN BODY-BONE SPACE. The outfit container is a CHILD of the `body` bone,
 * so (0,0) here is the centre of the torso ellipse and the garment inherits
 * whatever the body is doing. Two consequences that decide every shape below:
 *
 *  - The torso is an ellipse of `TORSO_HALF_WIDTH` x `TORSO_HALF_HEIGHT`, and a
 *    garment that does not follow it reads as a sticker. `hug()` returns the
 *    silhouette's half-width at a given height so every hem, strap and seam can
 *    be cut to the body instead of guessed.
 *  - Arms, head and tail are drawn AFTER the body, so they cover the outfit for
 *    free. That is why nothing here draws a sleeve: the shoulder simply runs
 *    under the arm, which is what a sleeveless top actually looks like, and a
 *    sleeve painted on the torso would swim when the arm swings.
 *
 * The garment edge is inset a few units from the silhouette so the cat's own
 * outline still closes around it — a shirt cut exactly to the body swallows the
 * outline and she loses her edge against a pale wall.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { TORSO_HALF_HEIGHT, TORSO_HALF_WIDTH } from '@/pet/rigLayout';
import type { ArtBox } from '@/ui/bake';

/**
 * Generous enough for the widest thing on the rack (the tutu's skirt, ±96) and
 * the longest (the raincoat's hem, +78). `bakeArt` CLIPS to this box rather
 * than growing it, so anything drawn outside loses its edge silently.
 */
export const OUTFIT_BOX: ArtBox = { left: -104, top: -62, right: 104, bottom: 92 };

export type OutfitDraw = (gfx: Phaser.GameObjects.Graphics) => void;

const OUTLINE = PALETTE.line;
/** Thinner than the body's 12: a seam is not a silhouette. */
const SEAM_W = 7.5;

const V = Phaser.Math.Vector2;
type Pt = Phaser.Math.Vector2;

/** Half-width of the torso silhouette at height `y`, pulled in by `inset`. */
function hug(y: number, inset = 4): number {
  const k = Phaser.Math.Clamp(y / TORSO_HALF_HEIGHT, -1, 1);
  return Math.max(0, TORSO_HALF_WIDTH * Math.sqrt(1 - k * k) - inset);
}

/**
 * The body of a garment: a neckline, two sides cut to the torso, and a hem.
 *
 * `neckDip` scoops the collar so the chest blaze shows through — a straight
 * line across the top reads as a bib. `flare` pushes the hem out past the
 * silhouette, which is the difference between a shirt and a skirt.
 */
function garment(
  topY: number,
  hemY: number,
  { inset = 4, neckDip = 13, flare = 0, hemBow = 6, steps = 16 } = {},
): Pt[] {
  const pts: Pt[] = [];
  const at = (y: number, t: number): number => hug(y, inset) + flare * t;

  // Neckline, left shoulder across to right.
  const shoulder = hug(topY, inset);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push(new V(Phaser.Math.Linear(-shoulder, shoulder, u), topY + Math.sin(Math.PI * u) * neckDip));
  }
  // Right side, down to the hem.
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = Phaser.Math.Linear(topY, hemY, t);
    pts.push(new V(at(y, t), y));
  }
  // Hem, bowed down so it hangs rather than being ruled.
  const hem = at(hemY, 1);
  for (let i = 1; i < steps; i++) {
    const u = 1 - i / steps;
    pts.push(new V(Phaser.Math.Linear(-hem, hem, u), hemY + Math.sin(Math.PI * u) * hemBow));
  }
  // Left side, back up.
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const y = Phaser.Math.Linear(topY, hemY, t);
    pts.push(new V(-at(y, t), y));
  }
  return pts;
}

/** Fill a closed shape and stroke its edge in the character's one outline colour. */
function cloth(gfx: Phaser.GameObjects.Graphics, pts: Pt[], fill: number, weight = SEAM_W): void {
  gfx.lineStyle(weight, OUTLINE, 1);
  gfx.strokePoints(pts, true);
  gfx.fillStyle(fill, 1);
  gfx.fillPoints(pts, true);
}

/**
 * Light a garment the same way the rest of her is lit.
 *
 * Every part of the cat gets its form from one move: fill the whole shape in
 * the shade tone, then fill a slightly smaller copy, nudged up and left, in the
 * lit tone. What is left is a rim of shadow down the right and along the
 * bottom. The obvious alternative — clip a dark copy to one side of a vertical
 * line — was tried first and put a hard seam down the middle of her chest,
 * which is the one edge on the character that light does not explain.
 *
 * Call with the shade colour already filled; this lays the lit tone over it.
 */
function litOver(gfx: Phaser.GameObjects.Graphics, pts: Pt[], colour: number, cy: number): void {
  gfx.fillStyle(colour, 1);
  gfx.fillPoints(
    pts.map((p) => new V(p.x * 0.88 - 3, cy + (p.y - cy) * 0.87 - 3)),
    true,
  );
}

/** A seam or fold: a soft line that does not close. */
function stitch(gfx: Phaser.GameObjects.Graphics, pts: Pt[], colour: number, weight = 4): void {
  gfx.lineStyle(weight, colour, 1);
  gfx.strokePoints(pts, false);
}

/* ------------------------------------------------------------------ *
 * The rack
 * ------------------------------------------------------------------ */

const DENIM = 0x5b8fd4;
const DENIM_SH = 0x3f6ba8;
const HOOD = 0x7fd9b8;
const HOOD_SH = 0x4fbe96;
const MAC = 0xffc94d;
const MAC_SH = 0xdda524;
/**
 * The suit is NOT white. She is white, and a white garment on white fur is a
 * silhouette with some panel lines on it — the shape disappears at the shop
 * card's scale and reads as a bald patch at full size.
 */
const SUIT = 0xe4ebf8;
const SUIT_SH = 0xb2c0dd;

export const OUTFIT_ART: Readonly<Record<string, OutfitDraw>> = {
  /**
   * Tee. The cheapest thing on the rack and the one that has to prove the slot
   * works, so it is the plainest shape there is: a scooped collar, a hem above
   * the legs, and one stripe.
   */
  tee: (gfx) => {
    const body = garment(-46, 33, { neckDip: 9 });
    cloth(gfx, body, PALETTE.blueLo);
    litOver(gfx, body, PALETTE.sky, -6);
    // A chest band, cut to the same silhouette so it bends with her.
    const band: Pt[] = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const y = 2 + Math.sin(Math.PI * u) * 5;
      band.push(new V(Phaser.Math.Linear(-hug(y, 7), hug(y, 7), u), y));
    }
    stitch(gfx, band, PALETTE.white, 10);
    // Collar rib, so the neckline is a hem rather than where the fill stops.
    const collar: Pt[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      collar.push(new V(Phaser.Math.Linear(-hug(-46, 4), hug(-46, 4), u), -46 + Math.sin(Math.PI * u) * 9));
    }
    stitch(gfx, collar, OUTLINE, 11);
    stitch(gfx, collar, PALETTE.white, 6);
  },

  /**
   * Dungarees. Straps rather than a collar, because the slot's real problem is
   * that a torso-only garment can look pasted on — two straps crossing the
   * shoulder line and disappearing behind the head are what say "worn".
   */
  dungarees: (gfx) => {
    const bib = garment(-30, 38, { neckDip: 5, hemBow: 8 });
    cloth(gfx, bib, DENIM_SH);
    litOver(gfx, bib, DENIM, 4);
    // Straps up over each shoulder. They run under the head, which is drawn
    // after the body — the cut-off is the head, not a line we have to fake.
    for (const dir of [-1, 1] as const) {
      const strap: Pt[] = [
        new V(dir * 12, -28),
        new V(dir * 20, -38),
        new V(dir * 30, -48),
        new V(dir * 34, -58),
      ];
      stitch(gfx, strap, OUTLINE, 20);
      stitch(gfx, strap, dir > 0 ? DENIM_SH : DENIM, 13);
      // Buckle where the strap meets the bib.
      gfx.fillStyle(PALETTE.butter, 1);
      gfx.lineStyle(3.5, OUTLINE, 1);
      gfx.fillRoundedRect(dir * 12 - 8, -34, 16, 13, 3);
      gfx.strokeRoundedRect(dir * 12 - 8, -34, 16, 13, 3);
    }
    // Pocket.
    gfx.lineStyle(4, DENIM_SH, 1);
    gfx.strokeRoundedRect(-19, 2, 38, 26, 5);
    stitch(gfx, [new V(-14, 10), new V(14, 10)], 0xf0d9a0, 3);
  },

  /**
   * Hoodie. The hood is a rolled collar rather than something over her head —
   * the outfit slot lives under the head bone, so a real hood would be drawn
   * behind her ears and never seen. A thick collar at the neck reads as one
   * anyway, and it is the shape that survives the shop card's 0.26 scale.
   */
  hoodie: (gfx) => {
    const body = garment(-44, 36, { neckDip: 7 });
    cloth(gfx, body, HOOD_SH);
    litOver(gfx, body, HOOD, -4);

    // Kangaroo pocket: one arc across the belly with two openings.
    const pocket: Pt[] = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18;
      const x = Phaser.Math.Linear(-34, 34, u);
      pocket.push(new V(x, 6 + Math.sin(Math.PI * u) * 11));
    }
    stitch(gfx, pocket, HOOD_SH, 5);
    stitch(gfx, [new V(-34, 6), new V(-30, 20)], HOOD_SH, 5);
    stitch(gfx, [new V(34, 6), new V(30, 20)], HOOD_SH, 5);

    // The rolled collar, drawn last so it sits over the shoulders.
    const collar: Pt[] = [];
    for (let i = 0; i <= 22; i++) {
      const u = i / 22;
      const x = Phaser.Math.Linear(-hug(-46, -6), hug(-46, -6), u);
      collar.push(new V(x, -44 + Math.sin(Math.PI * u) * 16));
    }
    stitch(gfx, collar, OUTLINE, 26);
    stitch(gfx, collar, HOOD_SH, 18);
    stitch(
      gfx,
      collar.map((p) => new V(p.x * 0.9, p.y - 2)),
      HOOD,
      7,
    );

    // Drawstrings, with a tip each so they are not two stray hairs.
    for (const dir of [-1, 1] as const) {
      stitch(gfx, [new V(dir * 10, -22), new V(dir * 13, -8), new V(dir * 9, 2)], PALETTE.cream, 5);
      gfx.fillStyle(PALETTE.butter, 1);
      gfx.fillCircle(dir * 9, 3, 4.5);
    }
  },

  /**
   * Tutu. The only outfit that changes her silhouette rather than colouring it
   * in, which is why it is a gem item — the gem rack is meant to be the one you
   * arrive at, so it gets the shape nothing else on the rack has.
   */
  tutu: (gfx) => {
    const bodice = garment(-46, 12, { neckDip: 10, hemBow: 3 });
    cloth(gfx, bodice, PALETTE.coralLo);
    litOver(gfx, bodice, PALETTE.coral, -14);

    // Three layers of net, back to front, each one wider and paler. Scalloped,
    // because a straight edge on a tutu is the one thing that kills it.
    const layers = [
      { y: 20, w: 96, drop: 30, fill: PALETTE.pinkLo },
      { y: 16, w: 84, drop: 24, fill: PALETTE.pink },
      { y: 12, w: 70, drop: 18, fill: PALETTE.inner },
    ] as const;
    for (const layer of layers) {
      const pts: Pt[] = [new V(-28, layer.y - 8), new V(28, layer.y - 8), new V(layer.w, layer.y)];
      const scallops = 7;
      for (let i = 0; i <= scallops * 6; i++) {
        const u = 1 - i / (scallops * 6);
        const x = Phaser.Math.Linear(-layer.w, layer.w, u);
        const wave = Math.abs(Math.sin(Math.PI * u * scallops)) * 9;
        pts.push(new V(x, layer.y + layer.drop - wave));
      }
      pts.push(new V(-layer.w, layer.y));
      cloth(gfx, pts, layer.fill, 6);
    }

    // Waistband over the join, so the bodice and the net are one garment.
    stitch(gfx, [new V(-46, 11), new V(0, 15), new V(46, 11)], OUTLINE, 13);
    stitch(gfx, [new V(-44, 11), new V(0, 14.5), new V(44, 11)], PALETTE.coralLo, 8);
    // A bloom at the waist.
    gfx.fillStyle(PALETTE.butter, 1);
    gfx.lineStyle(3, OUTLINE, 1);
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      gfx.fillCircle(Math.cos(a) * 8, 13 + Math.sin(a) * 8, 6);
    }
    gfx.fillStyle(PALETTE.cream, 1);
    gfx.fillCircle(0, 13, 5);
  },

  /**
   * Raincoat. The longest garment on the rack — it comes down over the top of
   * her feet, which is the only way a coat differs from a long shirt.
   */
  raincoat: (gfx) => {
    const body = garment(-44, 54, { neckDip: 8, flare: 9, hemBow: 8 });
    cloth(gfx, body, MAC_SH);
    litOver(gfx, body, MAC, 8);

    // Front opening, off-centre so it reads as an overlap rather than a fold.
    stitch(gfx, [new V(6, -36), new V(9, 10), new V(7, 52)], MAC_SH, 6);
    gfx.fillStyle(PALETTE.cream, 1);
    gfx.lineStyle(3, OUTLINE, 1);
    for (const y of [-16, 2, 20, 38]) {
      gfx.fillCircle(-6, y, 5.5);
      gfx.strokeCircle(-6, y, 5.5);
    }

    // Storm collar: two flaps rather than a roll, which is what makes it a
    // coat and not the hoodie in another colour.
    for (const dir of [-1, 1] as const) {
      const flap: Pt[] = [
        new V(dir * 2, -42),
        new V(dir * 36, -34),
        new V(dir * 26, -14),
        new V(dir * 4, -26),
      ];
      cloth(gfx, flap, dir > 0 ? MAC_SH : MAC, 6);
    }
    // Pocket flaps.
    for (const dir of [-1, 1] as const) {
      gfx.fillStyle(MAC_SH, 1);
      gfx.lineStyle(3.5, OUTLINE, 1);
      gfx.fillRoundedRect(dir * 30 - 14, 16, 28, 12, 4);
      gfx.strokeRoundedRect(dir * 30 - 14, 16, 28, 12, 4);
    }
  },

  /**
   * Space suit. The top of the rack, so it gets the most going on: a sealed
   * ring collar, a chest panel with lights, and a life-support pack whose
   * straps come over the shoulders.
   */
  space: (gfx) => {
    const body = garment(-46, 42, { neckDip: 5, flare: 3, hemBow: 7 });
    cloth(gfx, body, SUIT_SH);
    litOver(gfx, body, SUIT, 0);

    // Ribbed midriff — three bands cut to the body.
    for (const y of [22, 30, 38]) {
      stitch(gfx, [new V(-hug(y, 7), y), new V(0, y + 2), new V(hug(y, 7), y)], SUIT_SH, 5);
    }
    // Shoulder straps, running up under the head like the dungarees'.
    for (const dir of [-1, 1] as const) {
      const strap: Pt[] = [new V(dir * 16, 6), new V(dir * 28, -22), new V(dir * 34, -52)];
      stitch(gfx, strap, OUTLINE, 18);
      stitch(gfx, strap, dir > 0 ? SUIT_SH : PALETTE.white, 11);
    }
    // Chest panel.
    gfx.fillStyle(PALETTE.ink, 1);
    gfx.lineStyle(4, OUTLINE, 1);
    gfx.fillRoundedRect(-26, -18, 52, 30, 7);
    gfx.strokeRoundedRect(-26, -18, 52, 30, 7);
    const lights = [PALETTE.meterFun, PALETTE.butter, PALETTE.coral] as const;
    lights.forEach((colour, i) => {
      gfx.fillStyle(colour, 1);
      gfx.fillCircle(-14 + i * 14, -10, 5);
    });
    gfx.fillStyle(PALETTE.sky, 1);
    gfx.fillRoundedRect(-18, 0, 36, 7, 3.5);

    // Sealed ring collar, last and thickest.
    const ring: Pt[] = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      ring.push(
        new V(Phaser.Math.Linear(-hug(-46, -4), hug(-46, -4), u), -46 + Math.sin(Math.PI * u) * 11),
      );
    }
    stitch(gfx, ring, OUTLINE, 22);
    stitch(gfx, ring, PALETTE.sky, 15);
  },
};

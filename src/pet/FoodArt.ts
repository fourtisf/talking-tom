/**
 * Food, drawn to be held.
 *
 * The tray icons are 24px pictograms: a shape you read at a glance in a button.
 * The first version of hand feeding scaled one of those up to 62px and put it
 * under the player's finger, where it stopped being a symbol and started being
 * an object — and a symbol blown up two and a half times is an orange oval with
 * a triangle stuck on it. This is the same food drawn at the size it is
 * actually held: outlined, two-tone, with a highlight, in the style the cat and
 * the hats are drawn in.
 *
 * Baked to a texture like every other static drawing here. Phaser re-tessellates
 * a Graphics object every frame, and this one is dragged across the screen.
 */

import type Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { bakeArt, type ArtBox } from '@/ui/bake';

/** Drawn around (0,0) inside this box. `bakeArt` CLIPS to it. */
export const FOOD_BOX: ArtBox = { left: -64, top: -56, right: 64, bottom: 56 };

const OUTLINE = 0x33243f;
const STROKE = 6;

type Draw = (g: Phaser.GameObjects.Graphics) => void;

/**
 * One drawing per food id. A missing id falls back to `fish`, so a food added
 * to `tuning.ts` without art still works — badly, and visibly, which is the
 * right kind of failure.
 */
const FOOD_ART: Readonly<Record<string, Draw>> = {
  fish: (g) => {
    // Tail first so the body's outline crosses it and the two read as joined.
    g.fillStyle(0xe8763a, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillTriangle(30, 0, 62, -30, 62, 30);
    g.strokeTriangle(30, 0, 62, -30, 62, 30);

    g.fillStyle(0xff9a5b, 1);
    g.fillEllipse(-4, 0, 92, 62);
    g.strokeEllipse(-4, 0, 92, 62);

    // Belly, lit from the lower left like everything else in the game.
    g.fillStyle(0xffc79a, 1);
    g.fillEllipse(-10, 10, 66, 30);

    // Dorsal fin, tucked so it does not break the silhouette.
    g.fillStyle(0xe8763a, 1);
    g.lineStyle(5, OUTLINE, 1);
    g.fillTriangle(-2, -30, 22, -46, 26, -26);
    g.strokeTriangle(-2, -30, 22, -46, 26, -26);

    g.lineStyle(4, 0xe8763a, 1);
    g.beginPath();
    g.moveTo(14, -22);
    g.lineTo(20, 0);
    g.lineTo(14, 22);
    g.strokePath();

    g.fillStyle(PALETTE.white, 1);
    g.fillCircle(-26, -6, 11);
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(-24, -5, 6);
    g.fillStyle(PALETTE.white, 1);
    g.fillCircle(-27, -8, 2.6);
  },

  milk: (g) => {
    g.fillStyle(0xeaf6fb, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillRoundedRect(-30, -18, 60, 66, 8);
    g.strokeRoundedRect(-30, -18, 60, 66, 8);

    // Gabled top, drawn over the carton so the seam sits where a fold would.
    g.fillStyle(0xcfeaf5, 1);
    g.fillTriangle(-30, -18, 0, -52, 30, -18);
    g.strokeTriangle(-30, -18, 0, -52, 30, -18);

    g.fillStyle(PALETTE.sky, 1);
    g.fillRoundedRect(-18, 2, 36, 30, 5);

    g.fillStyle(PALETTE.white, 0.5);
    g.fillRoundedRect(-24, -12, 9, 52, 4);
  },

  steak: (g) => {
    g.fillStyle(0xd35b52, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillEllipse(2, 2, 100, 76);
    g.strokeEllipse(2, 2, 100, 76);

    g.fillStyle(0xf0836f, 1);
    g.fillEllipse(-2, -2, 76, 54);

    // Marbling. Three short strokes, not a pattern — at this size a pattern
    // turns to noise.
    g.lineStyle(5, 0xffb9a6, 1);
    for (const [x, y, w] of [
      [-14, -12, 22],
      [4, 2, 26],
      [-6, 16, 18],
    ] as const) {
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.lineTo(x + w / 2, y - 4);
      g.strokePath();
    }

    // Bone.
    g.fillStyle(0xfff7ec, 1);
    g.lineStyle(5, OUTLINE, 1);
    g.fillRoundedRect(-56, -10, 26, 22, 11);
    g.strokeRoundedRect(-56, -10, 26, 22, 11);
  },

  cake: (g) => {
    g.fillStyle(0xffd9e4, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillRoundedRect(-46, -6, 92, 50, 8);
    g.strokeRoundedRect(-46, -6, 92, 50, 8);

    // Frosting, sitting proud of the sponge rather than painted on it.
    g.fillStyle(PALETTE.white, 1);
    g.fillRoundedRect(-46, -20, 92, 22, 10);
    g.strokeRoundedRect(-46, -20, 92, 22, 10);

    g.fillStyle(0xffb3c8, 1);
    g.fillRoundedRect(-40, 12, 80, 12, 6);

    // Candle.
    g.fillStyle(0xfff7ec, 1);
    g.lineStyle(4.5, OUTLINE, 1);
    g.fillRoundedRect(-5, -46, 10, 28, 4);
    g.strokeRoundedRect(-5, -46, 10, 28, 4);
    g.fillStyle(PALETTE.butter, 1);
    g.lineStyle(0, OUTLINE, 0);
    g.fillEllipse(0, -52, 13, 18);
    g.fillStyle(0xffedb8, 1);
    g.fillEllipse(0, -50, 6, 9);
  },

  sushi: (g) => {
    // Nori band, rice, then the slice on top: outside in, so each fill covers
    // the edge of the one beneath and there is no seam to line up.
    g.fillStyle(0x2f4a3a, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillRoundedRect(-34, -14, 68, 62, 10);
    g.strokeRoundedRect(-34, -14, 68, 62, 10);

    g.fillStyle(0xfdf6ef, 1);
    g.fillRoundedRect(-27, -8, 54, 50, 8);

    g.fillStyle(0xff8a5b, 1);
    g.lineStyle(5, OUTLINE, 1);
    g.fillEllipse(0, -20, 84, 34);
    g.strokeEllipse(0, -20, 84, 34);

    g.lineStyle(4, 0xffb08c, 1);
    for (const y of [-26, -18]) {
      g.beginPath();
      g.moveTo(-30, y);
      g.lineTo(30, y + 3);
      g.strokePath();
    }
  },

  feast: (g) => {
    // A domed cloche with the lid lifting. One idea, drawn big.
    g.fillStyle(0xdfe6f2, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.beginPath();
    g.arc(0, 18, 50, Math.PI, 0, false);
    g.closePath();
    g.fillPath();
    g.strokePath();

    g.fillStyle(0xf4f7fc, 1);
    g.fillEllipse(-16, 0, 34, 26);

    g.fillStyle(0xc3cede, 1);
    g.fillRoundedRect(-58, 14, 116, 16, 8);
    g.strokeRoundedRect(-58, 14, 116, 16, 8);

    g.fillStyle(PALETTE.butter, 1);
    g.lineStyle(5, OUTLINE, 1);
    g.fillCircle(0, -38, 12);
    g.strokeCircle(0, -38, 12);
  },
};

/** A ready-to-place image of `id`, drawn at `size` across. */
export function makeFood(scene: Phaser.Scene, id: string, size: number): Phaser.GameObjects.Image {
  const draw = FOOD_ART[id] ?? FOOD_ART['fish'];
  const image = bakeArt(scene, `food:${id}`, FOOD_BOX, (g) => draw?.(g));
  // The box is 128 wide; scale to whatever the caller asked for.
  image.setScale(size / (FOOD_BOX.right - FOOD_BOX.left));
  return image;
}

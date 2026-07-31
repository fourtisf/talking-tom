/**
 * Rugs. The one thing in the living room the player gets to choose.
 *
 * WHY A RUG AND NOT A POSTER, which is what this started as. The living room
 * is full: at 420px the window owns the middle of the wall, a shelf and a
 * plant own the left, the picture frame and the litter tray own the right, and
 * her head owns everything between. The only empty patch was 70x90 and half
 * under the toilet-roll shelf. The floor, by contrast, has exactly one object
 * on it, it is dead centre, it is the second-largest colour area in the scene
 * after the walls, and she stands on it — so it is in every photograph.
 *
 * DRAWN LIVE, OVER THE BAKED ONE. `buildHome` bakes its props into a single
 * texture, which is why the room costs one draw call; rebuilding that texture
 * to change a rug would mean tearing down and re-baking a room layer on a tap.
 * Each of these is opaque and sized to cover the default, so the layer is a
 * container that gets emptied and redrawn, and the baked room never moves.
 *
 * Every rug is drawn around (0, 0) so the caller places it, and every one fits
 * inside the default's 250x56 footprint — see the test.
 */

import type Phaser from 'phaser';

import { PALETTE } from '@/config/palette';

/** The default rug in `buildHome`. Anything here has to cover it. */
export const RUG_BASE = { width: 250, height: 56 } as const;

export type DecorId = 'rug.blush' | 'rug.moss' | 'rug.sun' | 'rug.tide' | 'rug.stripe' | 'rug.stars';

type Draw = (g: Phaser.GameObjects.Graphics) => void;

/** Body, then rim, then whatever is on top. Same three steps every time. */
function plain(g: Phaser.GameObjects.Graphics, fill: number, rim: number): void {
  g.fillStyle(fill, 1);
  g.fillEllipse(0, 0, RUG_BASE.width, RUG_BASE.height);
  g.lineStyle(10, rim, 1);
  g.strokeEllipse(0, 0, RUG_BASE.width - 18, RUG_BASE.height - 16);
}

const RUGS: Readonly<Record<DecorId, Draw>> = {
  'rug.blush': (g) => plain(g, 0xffc2d8, 0xffa8c6),
  'rug.moss': (g) => plain(g, 0x9adfc2, 0x63c6a1),
  'rug.sun': (g) => plain(g, 0xffdc92, 0xf0bc57),
  'rug.tide': (g) => plain(g, 0xa8d8f0, 0x74b9dd),

  /**
   * Concentric rings rather than stripes.
   *
   * Straight stripes across an ellipse this flat turn into a barcode — 56px of
   * height across five bands is 11px each before the perspective squash, and
   * at that pitch they moire against the floorboards behind them. Rings follow
   * the shape instead, so they read as a rug rather than as a rendering fault.
   */
  'rug.stripe': (g) => {
    g.fillStyle(0xe6dcf8, 1);
    g.fillEllipse(0, 0, RUG_BASE.width, RUG_BASE.height);
    const tones = [0xa88bd8, 0xe6dcf8, 0xa88bd8];
    tones.forEach((tone, i) => {
      g.lineStyle(9, tone, 1);
      const k = 1 - i * 0.26;
      g.strokeEllipse(0, 0, (RUG_BASE.width - 18) * k, (RUG_BASE.height - 16) * k);
    });
  },

  /**
   * Night sky. The stars are placed on the ellipse's own scale, not scattered
   * in a box — a uniform scatter puts half of them outside the rug at the ends,
   * where a 250x56 ellipse is only a few pixels tall.
   */
  'rug.stars': (g) => {
    g.fillStyle(0x4b3d72, 1);
    g.fillEllipse(0, 0, RUG_BASE.width, RUG_BASE.height);
    g.lineStyle(9, 0x6a58a0, 1);
    g.strokeEllipse(0, 0, RUG_BASE.width - 18, RUG_BASE.height - 16);
    g.fillStyle(PALETTE.butter, 1);
    for (const [u, v, r] of [
      [-0.62, 0.1, 3],
      [-0.3, -0.42, 2.4],
      [0.04, 0.34, 3.2],
      [0.36, -0.3, 2.6],
      [0.66, 0.16, 3],
      [-0.02, -0.06, 2],
    ] as const) {
      g.fillCircle((u * (RUG_BASE.width - 40)) / 2, (v * (RUG_BASE.height - 18)) / 2, r);
    }
  },
};

export function isDecorId(value: string | null | undefined): value is DecorId {
  return value !== null && value !== undefined && value in RUGS;
}

/** Draw `id` centred on (x, y). Returns null for an id this build does not know. */
export function buildDecor(
  scene: Phaser.Scene,
  id: string,
  x: number,
  y: number,
): Phaser.GameObjects.Graphics | null {
  if (!isDecorId(id)) return null;
  const g = scene.add.graphics().setPosition(x, y);
  RUGS[id](g);
  return g;
}

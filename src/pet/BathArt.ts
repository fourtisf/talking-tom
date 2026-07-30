/**
 * Bath things, drawn to be held.
 *
 * Same rule as `FoodArt`: a 24px tray pictogram blown up to 84 and put under a
 * finger stops being a symbol and starts being an object, and an object has to
 * survive the look. These are drawn at the size they are actually held, in the
 * same outlined two-tone style as the cat and the furniture.
 *
 * Each tool declares where its WORKING END is. The soap rubs with its whole
 * face and the brush with its bristles, but a toothbrush held by the handle
 * cleans with a head 30px away from the middle of the sprite — measuring the
 * rub from the centre would have her teeth cleaned by the wrong end.
 */

import type Phaser from 'phaser';

import { BATHING } from '@/config/tuning';
import { PALETTE } from '@/config/palette';
import { bakeArt, type ArtBox } from '@/ui/bake';

/** Drawn around (0,0) inside this box. `bakeArt` CLIPS to it. */
export const TOOL_BOX: ArtBox = { left: -70, top: -70, right: 70, bottom: 70 };

const OUTLINE = PALETTE.line;
const STROKE = 6;


export type ToolId = 'soap' | 'brush' | 'tooth' | 'rinse';

export interface ToolDef {
  readonly id: ToolId;
  /**
   * The end that does the work, in ART space — the same coordinates the
   * drawings above use, not screen pixels. Screen offsets were the first
   * version and they silently went wrong the moment a tool changed size, since
   * the sprite scales and a hardcoded pixel offset does not.
   */
  readonly tip: { x: number; y: number };
  /** How wide it is held, in screen pixels. */
  readonly size: number;
}

export const TOOLS: Readonly<Record<ToolId, ToolDef>> = {
  soap: { id: 'soap', tip: { x: 0, y: 10 }, size: BATHING.toolSize },
  brush: { id: 'brush', tip: { x: 0, y: 36 }, size: BATHING.toolSize },
  /*
   * The toothbrush is SMALLER than the rest, and it has to be.
   *
   * At the shared 84px its head alone was wider than her whole mouth, so the
   * one tool whose target you have to be able to see covered it completely —
   * she opened up, and the player got a look at the back of a toothbrush.
   */
  tooth: { id: 'tooth', tip: { x: -36, y: 20 }, size: 58 },
  rinse: { id: 'rinse', tip: { x: 0, y: 50 }, size: BATHING.toolSize },
};

/** Art space -> screen, for a tool drawn at its own size. */
export function toolScale(id: ToolId): number {
  return TOOLS[id].size / (TOOL_BOX.right - TOOL_BOX.left);
}

type Draw = (g: Phaser.GameObjects.Graphics) => void;

const TOOL_ART: Readonly<Record<ToolId, Draw>> = {
  /** A bar of soap, with the lather already coming off it. */
  soap: (g) => {
    g.fillStyle(0x8fd8f2, 0.55);
    for (const [x, y, r] of [
      [-42, -34, 15],
      [-16, -50, 11],
      [24, -42, 13],
      [46, -22, 9],
    ] as const) {
      g.fillCircle(x, y, r);
    }

    g.fillStyle(0xffe3f0, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillRoundedRect(-52, -18, 104, 52, 22);
    g.strokeRoundedRect(-52, -18, 104, 52, 22);

    // Top face, so the bar has a thickness rather than being a sticker.
    g.fillStyle(PALETTE.white, 1);
    g.fillRoundedRect(-44, -12, 88, 22, 11);

    // Embossed paw, the one mark that says whose soap it is.
    g.fillStyle(PALETTE.inner, 1);
    g.fillEllipse(0, 20, 20, 14);
    for (const [dx, dy] of [
      [-11, 8],
      [0, 4],
      [11, 8],
    ] as const) {
      g.fillEllipse(dx, dy, 10, 10);
    }
  },

  /** A scrubbing brush, bristles down. */
  brush: (g) => {
    g.fillStyle(0xe0be93, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    // Handle first, so the block's outline crosses it.
    g.fillRoundedRect(-16, -60, 32, 46, 14);
    g.strokeRoundedRect(-16, -60, 32, 46, 14);

    g.fillStyle(0xd2a074, 1);
    g.fillRoundedRect(-54, -22, 108, 40, 14);
    g.strokeRoundedRect(-54, -22, 108, 40, 14);
    g.fillStyle(0xecc79d, 1);
    g.fillRoundedRect(-46, -16, 92, 14, 7);

    // Bristles. Drawn as separate tufts: a solid block reads as a sponge.
    g.fillStyle(0xfff0c2, 1);
    g.lineStyle(4, OUTLINE, 1);
    for (let i = 0; i < 6; i++) {
      const x = -45 + i * 18;
      g.fillRoundedRect(x, 14, 12, 26, { bl: 6, br: 6 });
      g.strokeRoundedRect(x, 14, 12, 26, { bl: 6, br: 6 });
    }
  },

  /** A toothbrush, head to the left. */
  tooth: (g) => {
    g.fillStyle(PALETTE.mint, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillRoundedRect(-26, -14, 92, 22, 11);
    g.strokeRoundedRect(-26, -14, 92, 22, 11);
    g.fillStyle(0xa5ecd1, 1);
    g.fillRoundedRect(-18, -10, 76, 8, 4);

    // Head.
    g.fillStyle(PALETTE.mint, 1);
    g.fillRoundedRect(-56, -16, 40, 26, 12);
    g.strokeRoundedRect(-56, -16, 40, 26, 12);

    g.fillStyle(PALETTE.white, 1);
    g.lineStyle(4, OUTLINE, 1);
    for (let i = 0; i < 3; i++) {
      const x = -52 + i * 12;
      g.fillRoundedRect(x, 8, 9, 20, { bl: 4, br: 4 });
      g.strokeRoundedRect(x, 8, 9, 20, { bl: 4, br: 4 });
    }

    // A worm of paste, because a toothbrush without it is a small brush.
    g.fillStyle(0x8fd8f2, 1);
    g.lineStyle(4, OUTLINE, 1);
    g.fillRoundedRect(-50, 0, 32, 12, 6);
    g.strokeRoundedRect(-50, 0, 32, 12, 6);
  },

  /** A shower head on its hose. */
  rinse: (g) => {
    g.lineStyle(11, 0xb0a2c8, 1);
    g.beginPath();
    g.moveTo(34, -62);
    g.lineTo(14, -34);
    g.lineTo(2, -18);
    g.strokePath();

    g.fillStyle(0xdfe6f2, 1);
    g.lineStyle(STROKE, OUTLINE, 1);
    g.fillRoundedRect(-14, -26, 28, 24, 8);
    g.strokeRoundedRect(-14, -26, 28, 24, 8);

    // The plate, wider than the neck so the shape reads at a glance.
    g.fillStyle(0xeff4fb, 1);
    g.fillRoundedRect(-46, -6, 92, 30, 12);
    g.strokeRoundedRect(-46, -6, 92, 30, 12);
    g.fillStyle(0xc3cede, 1);
    g.fillRoundedRect(-38, 10, 76, 10, 5);

    g.fillStyle(0x6fc9ea, 1);
    for (let i = 0; i < 5; i++) g.fillCircle(-32 + i * 16, 30, 5);
  },
};

/** A ready-to-place image of `id`, at the size that tool is held. */
export function makeTool(scene: Phaser.Scene, id: ToolId): Phaser.GameObjects.Image {
  const image = bakeArt(scene, `tool:${id}`, TOOL_BOX, (g) => TOOL_ART[id](g));
  image.setScale(toolScale(id));
  return image;
}

/**
 * A smudge of dirt.
 *
 * Ragged rather than round: a circle of brown on a white cat reads as a hole,
 * and the thing that makes it read as grime is an edge that is not a shape.
 * `seed` picks the wobble, so the five spots on her are not five of the same
 * blob at different sizes.
 */
export function makeSmudge(scene: Phaser.Scene, seed: number, size: number): Phaser.GameObjects.Image {
  const box: ArtBox = { left: -34, top: -34, right: 34, bottom: 34 };
  const image = bakeArt(scene, `smudge:${seed}`, box, (g) => {
    for (const [tone, alpha, grow] of [
      [0x9a7f63, 0.42, 1],
      [0x7c624a, 0.34, 0.62],
    ] as const) {
      g.fillStyle(tone, alpha);
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        // Deterministic wobble — no Math.random, so a re-bake of the same seed
        // is the same texture and the atlas cache stays honest.
        const wobble = 22 + Math.sin(a * 3 + seed) * 6 + Math.cos(a * 2 - seed) * 4;
        points.push({ x: Math.cos(a) * wobble * grow, y: Math.sin(a) * wobble * grow * 0.8 });
      }
      g.fillPoints(points, true);
    }
  });
  image.setScale(size / (box.right - box.left));
  return image;
}

/**
 * The mouth overlay's own box. Shared by the mouth and the plaque on purpose:
 * they are two layers of one drawing and have to line up to the pixel.
 */
const MOUTH_ART_BOX: ArtBox = { left: -34, top: -20, right: 34, bottom: 34 };

/* --------------------------- the tooth line -------------------------- */

/**
 * The open mouth's ellipse. Everything below is positioned against it.
 *
 * IT HAS TO FIT BETWEEN HER NOSE AND HER CHIN, and the first version did not.
 * In this space — the mouth bone's — the nose runs down to y +3.5 and the
 * bottom of the skull is at +29, which is a band 25 units tall. The first
 * mouth opened at y -8 and swallowed all but the top two units of her nose:
 * she opened her mouth and lost her nose, on a face that is mostly nose and
 * eyes. Short and wide is the shape that fits.
 */
const MOUTH = { cy: 15.5, rx: 25, ry: 11.5 } as const;
const MOUTH_TOP = MOUTH.cy - MOUTH.ry;
const MOUTH_H = MOUTH.ry * 2;

/** A fraction of the way down the mouth. Keeps the teeth tied to its height. */
const down = (f: number): number => MOUTH_TOP + MOUTH_H * f;
/** A fraction of the way out from the middle. Ties the teeth to its width. */
const across = (f: number): number => MOUTH.rx * f;

/** Half-width of the tooth row, where the canines sit, where the incisors end. */
const BAND_HALF = across(0.646);
const CANINE_X = across(0.527);
const CANINE_Y = down(0.488);
const INCISOR_HALF = across(0.435);
/** Where the incisors bite, and how much the row bows down in the middle. */
const BITE_Y = down(0.285);
const BITE_BOW = MOUTH_H * 0.021;
/** Where the row meets the corner of the mouth. */
const CORNER_Y = down(0.176);
/** Depth of the shaded band under the gum. */
const GUM_SHADE = MOUTH_H * 0.147;
/** Gaps between teeth, which is where the plaque thickens. */
const GAPS = [across(-0.435), across(-0.215), 0, across(0.215), across(0.435)] as const;

const TOOTH = 0xfdf6f1;
const TOOTH_SHADE = 0xe3c6d1;
const TOOTH_SEAM = 0xcda6b8;

/**
 * The roof of the mouth at a given x — the line the teeth hang from.
 *
 * This is the whole trick, and the first version's actual bug. Teeth placed at
 * a fixed y sit on a straight line inside a curved mouth, so the outer ones
 * poke up through her lip and the middle ones float. That is what a player saw
 * and called ugly.
 */
function roof(x: number, inset = 0): number {
  const rx = MOUTH.rx - inset;
  const ry = MOUTH.ry - inset;
  return MOUTH.cy - ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)));
}

/**
 * The BITING EDGE: how far down each tooth comes.
 *
 * Flat-ish across the incisors with a slight bow, then a ramp down to the point
 * of each canine, then back up to the corner of the mouth. One function, used
 * by both the teeth and the plaque, because a plaque layer computing its own
 * copy of this would drift out of register the first time either was tweaked.
 */
function biteLine(x: number): number {
  const a = Math.abs(x);
  if (a <= INCISOR_HALF) return BITE_Y + BITE_BOW * (1 - (a / INCISOR_HALF) ** 2);
  if (a <= CANINE_X) {
    return BITE_Y + (CANINE_Y - BITE_Y) * ((a - INCISOR_HALF) / (CANINE_X - INCISOR_HALF));
  }
  return CANINE_Y + (CORNER_Y - CANINE_Y) * ((a - CANINE_X) / (BAND_HALF - CANINE_X));
}

function sample(from: number, to: number, steps: number, y: (x: number) => number) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = from + ((to - from) * i) / steps;
    out.push({ x, y: y(x) });
  }
  return out;
}

/**
 * Her mouth, open, with teeth in it.
 *
 * Laid OVER whichever mouth shape is showing rather than swapping the rig's own
 * `open` shape, so it does not have to fight the mood resolver for control of
 * her expression. It appears only while the toothbrush is out.
 *
 * THE ROW IS THE SHAPE. At sixty screen pixels the individual teeth are texture
 * on one band, not objects — drawn as separate outlined rectangles they come
 * out as a handful of loose white lumps with nothing holding them together,
 * which is exactly what the first attempt did. The teeth are one filled shape
 * between the roof of the mouth and the biting edge; the seams are hints.
 */
export function makeOpenMouth(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return bakeArt(scene, 'pet:mouth:brushing', MOUTH_ART_BOX, (g) => {
    // Three tones going back, so the mouth is a hole with a throat in it and
    // not a flat pink disc with marks on it.
    g.fillStyle(PALETTE.mouthInner, 1);
    g.fillEllipse(0, MOUTH.cy, MOUTH.rx * 2, MOUTH.ry * 2);
    g.fillStyle(0xc4577f, 1);
    g.fillEllipse(0, MOUTH.cy + MOUTH_H * 0.03, MOUTH.rx * 1.62, MOUTH_H * 0.76);
    g.fillStyle(0xa03f63, 1);
    g.fillEllipse(0, MOUTH.cy + MOUTH_H * 0.09, MOUTH.rx * 1.04, MOUTH_H * 0.5);

    g.fillStyle(0xec8fac, 1);
    g.fillEllipse(0, down(0.81), MOUTH.rx * 1.2, MOUTH_H * 0.38);
    g.fillStyle(0xf6a8c3, 1);
    g.fillEllipse(-2, down(0.76), MOUTH.rx * 0.85, MOUTH_H * 0.2);

    const upper = sample(-BAND_HALF, BAND_HALF, 26, (x) => roof(x));
    const lower = [
      { x: -BAND_HALF, y: CORNER_Y },
      ...sample(-CANINE_X, CANINE_X, 24, biteLine),
      { x: BAND_HALF, y: CORNER_Y },
    ];
    g.fillStyle(TOOTH, 1);
    g.fillPoints([...upper, ...[...lower].reverse()], true);

    // A band of shade under the gum, so the row has a near face and a top
    // rather than reading as a flat cut-out.
    const shade = GUM_SHADE;
    g.fillStyle(TOOTH_SHADE, 1);
    g.fillPoints(
      [...upper, ...upper.map((p) => ({ x: p.x, y: Math.min(p.y + shade, biteLine(p.x)) })).reverse()],
      true,
    );

    g.lineStyle(1.3, TOOTH_SEAM, 1);
    for (const x of [GAPS[1], 0, GAPS[3]]) {
      g.lineBetween(x, roof(x) + shade - 0.9, x * 1.14, biteLine(x) - 1.1);
    }

    // The lip goes on LAST, so it crops the teeth cleanly at the mouth's edge
    // instead of letting them spill over it.
    g.lineStyle(4.4, OUTLINE, 1);
    g.strokeEllipse(0, MOUTH.cy, MOUTH.rx * 2, MOUTH.ry * 2);
  });
}

/**
 * Plaque, along the gum line and thickening into the gaps between teeth.
 *
 * Where it collects, and — more to the point — the only place it can be seen to
 * come off. Painted across the face of a tooth, as the first version did, it
 * reads as decay rather than as something a brush will fix, and it leaves no
 * white anywhere to say these are teeth at all. Here the biting edge stays
 * white the whole time, so they are dirty teeth rather than a yellow bar.
 */
export function makePlaque(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return bakeArt(scene, 'pet:mouth:plaque', MOUTH_ART_BOX, (g) => {
    const depth = (x: number): number => {
      let d = MOUTH_H * 0.106;
      for (const gx of GAPS) {
        const t = Math.max(0, 1 - Math.abs(x - gx) / 5);
        d += MOUTH_H * 0.1 * t * t;
      }
      return d;
    };

    const half = BAND_HALF - 0.6;
    const top = sample(-half, half, 30, (x) => roof(x, 1.6));
    const under = top.map((p) => ({
      x: p.x,
      // Never past the biting edge: plaque that reaches the tip of a tooth is
      // a missing tooth.
      y: Math.max(p.y + 0.3, Math.min(p.y + depth(p.x), biteLine(p.x) - 0.7)),
    }));
    g.fillStyle(0xd9b45c, 0.92);
    g.fillPoints([...top, ...under.reverse()], true);

    g.fillStyle(0xb8892e, 0.8);
    for (const gx of GAPS) {
      const y = Math.min(roof(gx, 1.6) + depth(gx), biteLine(gx) - 0.7);
      g.fillCircle(gx, y - 1.3, 1.2);
    }
  });
}

/** A clump of suds. Three overlapping circles and a highlight. */
export function makeFoam(scene: Phaser.Scene, size: number): Phaser.GameObjects.Image {
  const box: ArtBox = { left: -32, top: -28, right: 32, bottom: 28 };
  const image = bakeArt(scene, 'foam:clump', box, (g) => {
    /*
     * Blue-white, with a blue outline that is not subtle.
     *
     * The first version was PALETTE.white with a pale rim, which is invisible:
     * the cat is white, so white suds on her read as nothing at all. Foam only
     * exists here by its edges, and the edges have to be a colour her fur is
     * not.
     */
    const lobes = [
      [-13, 3, 15],
      [12, 5, 13],
      [0, -8, 18],
    ] as const;
    g.fillStyle(0xdff0fa, 1);
    g.lineStyle(5, 0x9cc9e2, 1);
    for (const [x, y, r] of lobes) {
      g.fillCircle(x, y, r);
      g.strokeCircle(x, y, r);
    }
    // Fill over the inner half of every stroke, so the clump has one outline
    // rather than three circles drawn on top of each other.
    g.fillStyle(0xf4fbff, 1);
    for (const [x, y, r] of lobes) g.fillCircle(x, y, r - 2.5);
    g.fillStyle(PALETTE.white, 1);
    g.fillCircle(-6, -13, 7);
  });
  image.setScale(size / (box.right - box.left));
  return image;
}

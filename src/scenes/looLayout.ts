/**
 * The lavatory's measurements.
 *
 * Phaser-free, like `bathLayout` and `tableLayout`, and this one carries more
 * weight than either: the seat's inner lip is drawn OVER her, and it is the
 * only thing standing between a cat sitting on a lavatory and a cat standing
 * behind one with her legs sticking out through the porcelain.
 *
 * WHY A HUMAN WC AND NOT A LITTER TRAY. A tray asks the rig for the one thing
 * it categorically cannot do. A cat in a tray is read from above and behind —
 * she squats, she faces away, she scrapes. This rig is one front-on view with a
 * skull that never turns, no hip joint, and feet stuck on the bottom of the
 * torso. Put it in a tray and you get a cartoon cat standing upright in a box
 * of gravel, which is not the joke and is closer to the crude reading than the
 * polite one.
 *
 * A pedestal WC needs no new pose at all, because a figure seen from the front
 * ON a lavatory and the same figure seen from the front STANDING are the same
 * picture above the hips. So she is the ordinary standing rig lifted
 * `LOO_PET_RISE`, and everything the rig cannot do happens below the lip.
 *
 * `tests/lavatory.test.ts` walks that lip against her torso and both legs
 * column by column, because "no leg pixel escapes" is arithmetic and should not
 * need a canvas — or a particular screen width — to check.
 */

import type { RoomBox } from '@/scenes/bedLayout';

/**
 * How far she sits up out of her standing spot to be on the seat.
 *
 * SEVENTY-SEVEN, and the number changed shape completely once the legs stopped
 * being the thing that decided it.
 *
 * The first version tried to hide her legs behind the seat's inner lip, which
 * meant sinking her far enough into the hole that the lip crossed her thighs.
 * It passed every occlusion test and it looked wrong: a cat that far down a
 * bowl reads as being INSIDE a bucket, not sitting on a seat. The owner said
 * so in four words and was right.
 *
 * So the legs are simply not drawn while she is here — the same
 * `setVisible(false)` the sleeping pose uses for the limbs the duvet would
 * mangle. With nothing left to hide, she can sit HIGH: her bottom rests four
 * pixels into the ring, her paws land on the board either side, and the only
 * thing drawn over her is a thin crescent of the board's front edge. The bowl
 * is behind her rather than in front, which is the other half of why this now
 * reads as ON rather than IN.
 */
export const LOO_PET_RISE = 77;

/**
 * What she leaves in the bowl, and where it sits.
 *
 * Here rather than in the drawing because it has to be CHECKABLE: a deposit
 * that does not clear the seat's near lip is a tap with no visible result, and
 * one that pokes above the board's back edge floats on top of the fixture.
 * Both are arithmetic against `occluderTopY`, and both are silent failures.
 *
 * `offsetY` is measured from `seatCY`. Negative, so it rides high enough in
 * the hole to be seen over the lip that is drawn in front of it.
 */
export const DEPOSIT = { width: 57, height: 39, offsetY: -4 } as const;

export interface LooGeometry {
  centreX: number;
  /** Centre line of the seat board. Everything else hangs off it. */
  seatCY: number;
  seatRx: number;
  seatRy: number;
  /** The hole in the board — its NEAR edge is the occluder. */
  holeRx: number;
  holeRy: number;
  /** The near face of the pan, narrower than the seat so the board overhangs. */
  panRx: number;
  /** The pan's back, wider. The band of it that shows gives the fixture volume. */
  backRx: number;
  /** Where the fixture stands. */
  groundY: number;
  cisternTop: number;
  lidTop: number;
  /** Top of the tongue-and-groove wainscot. */
  railY: number;
}

/**
 * `RoomBox` plus the floor line, which the wainscot rail hangs off.
 *
 * Declared here rather than importing `RoomGeometry` from `rooms.ts`: that
 * module imports Phaser, and pulling Phaser into this one would cost the tests
 * the canvas-free property that is the whole point of the file. `RoomGeometry`
 * satisfies this structurally, so callers pass it unchanged.
 */
export interface LooRoom extends RoomBox {
  floorY: number;
}

export function looGeometry(geo: LooRoom): LooGeometry {
  return {
    centreX: Math.round(geo.width / 2),
    seatCY: geo.height - 175,
    seatRx: 116,
    seatRy: 37,
    // 92, so the board is an even 24px all the way round (116-92 laterally,
    // 37-13 front to back).
    holeRx: 92,
    holeRy: 13,
    /*
     * The bowl is much NARROWER than the board, and narrower than she is.
     *
     * At 94 the pan was 188 across and she is 190 — same width, same white, so
     * the two merged and she read as sitting in a bucket. A real lavatory
     * tapers hard below the seat, and the overhang is the thing that says the
     * board is a separate object she is perched on.
     */
    panRx: 72,
    backRx: 84,
    groundY: geo.height - 22,
    /*
     * Taller than it was, and it needs to be. The visible band is only what
     * shows either side of her, between the lid and the top of the board —
     * at 49px tall that read as a ledge rather than a cistern.
     */
    cisternTop: geo.height - 253,
    lidTop: geo.height - 271,
    railY: geo.floorY - 126,
  };
}

/**
 * The top edge of everything drawn over her, at horizontal offset `dx` from the
 * centre of the seat. Below this line she is hidden.
 *
 * Inside the hole it is the near lip, which the front layer draws as a
 * quadratic from (-holeRx, seatCY) through (0, seatCY + 2*holeRy) and back up.
 * A quadratic's midpoint sits at HALF its control offset, so the deepest point
 * of that curve is `seatCY + holeRy` and the closed form below is exact rather
 * than a sampling of it.
 *
 * Outside the hole the near crescent of the board closes flat across at
 * `seatCY`, so that is the line out to the edge of the board. Beyond the board
 * nothing is drawn over her at all, and this returns Infinity to say so.
 */
export function occluderTopY(loo: LooGeometry, dx: number): number {
  const x = Math.abs(dx);
  if (x <= loo.holeRx) {
    const u = x / loo.holeRx;
    return loo.seatCY + loo.holeRy * (1 - u * u);
  }
  if (x <= loo.seatRx) return loo.seatCY;
  return Number.POSITIVE_INFINITY;
}

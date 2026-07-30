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
 * The same move `BATH_PET_RISE` (86) makes, and less than it: a tub 140px deep
 * has to swallow her to the belly, a seat only has to reach her hips.
 *
 * SIXTY, NOT SIXTY-FOUR. The first pass at this room specified 64 with a
 * hole of 84 x 13, and walked the lip against her at ten sample columns. Ten
 * columns is not enough. At the leg ellipses' own centres — x = ±34.5, where a
 * leg is at its tallest and the lip has barely begun to dip — the leg's top
 * came out 1.0px ABOVE the lip. One pixel of paw through the porcelain, on
 * every screen size, in the one room where that reading is unacceptable.
 *
 * `tests/lavatory.test.ts` walks all 241 columns at 1px, which is what found
 * it. The numbers below were then solved rather than nudged, against four
 * conditions at once, and they are TIGHT — the heart on her chest clears the
 * lip by 2.8px and no arrangement does better than that, because her heart's
 * tip and her legs' tops are only 3.8 rig units apart. Do not adjust any of
 * the three by feel.
 */
export const LOO_PET_RISE = 60;

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
    /*
     * 92, so the board is an even 24px all the way round (116-92 laterally,
     * 37-13 front to back). It was 84, which both cost a pixel of leg cover at
     * the columns that mattered and made the board fatter at the sides than at
     * the front for no reason.
     */
    holeRx: 92,
    holeRy: 13,
    panRx: 94,
    backRx: 110,
    groundY: geo.height - 22,
    cisternTop: geo.height - 224,
    lidTop: geo.height - 240,
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

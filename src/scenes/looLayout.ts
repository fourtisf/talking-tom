/**
 * The lavatory's measurements.
 *
 * Phaser-free, like `bathLayout` and `tableLayout`, and this one carries more
 * weight than either: nothing here is drawn over her, so every scrap of "she is
 * sitting ON that" has to come out of where the numbers put her against where
 * the numbers put the porcelain. There is no lip to hide a mistake behind.
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
 * `LOO_PET_RISE`, sat forward on the board with her back paws on its front
 * band, and everything the rig cannot do is simply not asked for.
 *
 * TWO NUMBERS CARRY THE ROOM, and neither is her height. The board has to be
 * WIDER than her, so a horizontal plate shows at hip height either side; the
 * hole has to be NARROWER than her, so no dark opening shows there at all.
 * Get one without the other and she is standing in something — which is what
 * the first five versions of this room all managed, in five different ways.
 *
 * `tests/lavatory.test.ts` checks that perch across three screen widths,
 * because all of it is arithmetic between files that have no reason to agree
 * and none of it shows in a screenshot of one width.
 */

import type { RoomBox } from '@/scenes/bedLayout';

/**
 * How far she sits up out of her standing spot to be on the seat.
 *
 * SEVENTY-SIX, which is very nearly the 77 this was on its second attempt, and
 * that is worth saying plainly: the height was hardly ever the problem. Four
 * different heights were tried and rejected by eye, and each time the height
 * got the blame for something else.
 *
 * At 60 the seat's lip was drawn over her legs, which meant sinking her far
 * enough into the bowl for the lip to reach them — a cat in a bucket. At 77
 * the legs stopped being drawn instead, and the lip still crossed her hips, so
 * still a bucket. At 115 she went to the BACK of the board to get clear of the
 * lip altogether, and read as sitting behind the lavatory. At 57 the lip was
 * finally gone but the fixture was the wrong shape underneath her, so she read
 * as standing in front of the thing she was on.
 *
 * The fix was `seatRx`, `holeRx` and a contact shadow, not this. Once the board
 * was wider than her and the opening narrower, the height that works is the
 * obvious one: high enough that her back paws land on the front band of the
 * board, low enough that she is forward of its centre line. Nothing is drawn
 * over her at any point.
 *
 * The cost is that the bowl is behind her while she is on it — one front-on
 * view cannot show both her sitting and the thing she is sitting over. She
 * gets down for that beat instead, which is the other half of the same
 * decision and the reason `stepAsideX` exists.
 */
export const LOO_PET_RISE = 76;

/**
 * What she leaves in the bowl, and where it sits.
 *
 * Here rather than in the drawing because it has to be CHECKABLE against two
 * silent failures pulling in opposite directions. It has to fit inside the
 * opening, or it rides up onto the board and reads as balanced on the rim; and
 * it has to fit behind HER, or a corner of it shows past her hip while she is
 * still sitting down, which is a smudge on the cat rather than a pile in a
 * bowl. Neither shows up in a screenshot of the beat you happen to grab.
 *
 * `offsetY` is measured from `seatCY`. Zero: dead centre of the opening.
 * Nothing is drawn over it — the room has no front layer — so the only things
 * that can hide it are the two that are supposed to.
 */
export const DEPOSIT = { width: 44, height: 30, offsetY: 0 } as const;

/**
 * How far aside she steps to let the bowl be seen, and how close to the bezel
 * that is allowed to put her.
 *
 * A flat 168 walked her half off the left edge of a phone: the room column
 * there is 420 wide, so 168 from the middle is 42, and she is 190 across. The
 * floor is 116 — her head's half-width plus a thumb of margin — and on the
 * narrowest screen the two are the same number, which is the point. Left
 * rather than right because her tail sweeps out about 150px on her right, and
 * from anywhere on the left of the bowl that sweep lands on the bowl.
 */
export const STEP_ASIDE = 168;
export const STEP_MIN_X = 116;

/** Where she lands when she gets down, in room-column coordinates. */
export function stepAsideX(loo: LooGeometry): number {
  return Math.max(loo.centreX - STEP_ASIDE, STEP_MIN_X);
}

export interface LooGeometry {
  centreX: number;
  /** Centre line of the seat board. Everything else hangs off it. */
  seatCY: number;
  seatRx: number;
  seatRy: number;
  /** The hole in the board. Narrower than her waist — see `looGeometry`. */
  holeRx: number;
  holeRy: number;
  /** The pedestal's waist — its narrowest point, well under the board. */
  panRx: number;
  /** The pan's back, fatter. The band of it that shows gives the stem volume. */
  backRx: number;
  /** Where the fixture stands. */
  groundY: number;
  cisternTop: number;
  cisternRx: number;
  lidTop: number;
  /**
   * Centre of the flush plate, in room-column coordinates.
   *
   * On the geometry rather than in the drawing because `HomeScene` has to put
   * an invisible tap rectangle on exactly this spot, and the two lived as
   * separate hand-copied offsets until the plate moved and the tap did not.
   */
  flushX: number;
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
  const centreX = Math.round(geo.width / 2);
  return {
    centreX,
    seatCY: geo.height - 175,
    /*
     * THE NUMBER THAT MAKES THE ROOM WORK, and it is not her height.
     *
     * At 116 the board was 232 across and she is 190, so 21px of it showed
     * either side of her hips and the eye never found it — all it found was a
     * cat with a white column under her, which is a cat standing in a bucket
     * for the fourth time running. At 144 there are 49px of board out past
     * each hip, at exactly hip height, and a horizontal plate at hip height is
     * the entire grammar of "sitting on". Nothing is drawn over her, so what
     * shows either side of her is the only chance the board gets to be seen.
     *
     * An ELLIPSE, not the two quadratics it used to be. At this radius a
     * quadratic board ends in two sharp points and reads as a bow tie.
     */
    seatRx: 144,
    seatRy: 40,
    /*
     * NARROWER THAN HER WAIST, which is the other half of the same idea and
     * cost this room its fifth version.
     *
     * At 120 the hole was 240 across against a 123px torso, so 59px of dark
     * opening showed either side of her middle at exactly waist height. A dark
     * gap that size, there, is not a hole she is sitting over — it is a hole
     * she is down inside, and it undid everything the wings were doing. Under
     * her torso's half-width it simply cannot be seen while she is seated, and
     * the room gets to show it the moment she steps down instead.
     */
    holeRx: 54,
    holeRy: 24,
    /*
     * THE WAIST OF THE PEDESTAL, not the width of the bowl.
     *
     * The bowl's mouth is the hole; the porcelain falls away from it and pulls
     * IN to this before flaring out to the foot. That pinch is doing the same
     * job as the board's wings from the other direction. While the column
     * under her was 185 across against her 190 there was nothing to read but a
     * cat in a pot, whatever was happening at the rim — a shape as wide as she
     * is, directly below her, is a container she is inside of. At 46 the waist
     * is a quarter of her width and the whole thing reads as a stem.
     */
    panRx: 44,
    backRx: 58,
    groundY: geo.height - 22,
    /*
     * Raised again with her. What shows of it is only the slivers either side
     * of her, and sitting at the FRONT of the board she is 58px lower than she
     * was — enough to swallow a cistern that stopped where the old one did.
     */
    cisternTop: geo.height - 273,
    /*
     * Wider than her head, or it is not there.
     *
     * Everything behind her only exists in the slivers that show past her
     * silhouette, and hers is 190px across at the head. A 248px cistern left
     * 29px a side; 276 leaves 43, which is the difference between a shape and
     * a fringe.
     */
    cisternRx: 138,
    lidTop: geo.height - 291,
    /*
     * RIGHT of centre, and this is about where she is when it matters.
     *
     * It sat on the left for three versions, which was correct while she never
     * left the seat. She steps down to the left now — she has to, the bowl is
     * behind her otherwise — and on a phone she lands at x=116 with a 180px
     * head, so the plate was directly behind her face at the one moment it
     * became tappable. It is 116 the other way instead: clear of her head while
     * she is seated, and completely clear of her once she is not. Her tail
     * crosses it while she sits, which costs nothing, because the plate does
     * nothing until there is something to flush.
     */
    flushX: centreX + 116,
    railY: geo.floorY - 126,
  };
}

/**
 * The near edge of the seat board — the rim she is sitting on.
 *
 * The board is drawn as two quadratics rather than an ellipse, and a
 * quadratic's midpoint sits at HALF its control offset: the near half runs
 * from (±seatRx, seatCY) through a control at `seatCY + 2*seatRy`, so its
 * deepest point is `seatCY + seatRy`. This is the line her bottom has to land
 * a few pixels above and her back paws have to hang below, and it is the only
 * thing in the room saying she is on top of the fixture rather than behind it.
 */
export function boardNearY(loo: LooGeometry): number {
  return loo.seatCY + loo.seatRy;
}

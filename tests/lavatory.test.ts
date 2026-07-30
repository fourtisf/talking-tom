/**
 * The lavatory, and the difference between sitting ON one and standing IN one.
 *
 * The owner rejected five arrangements of this room by eye, each in one
 * sentence, and every one of them passed the tests it shipped with. Worth
 * naming them, because the tests below are the ones that would have caught
 * them:
 *
 *   1. Sunk to the thighs so the seat's lip could hide her legs. "Masa
 *      kucingnya berak masuk wc" — she was in a bucket.
 *   2. Legs not drawn, up on the ring, lip still across her hips. Still in it.
 *   3. Back of the board, opening in front of her, lip at her waist. Now she
 *      was sitting BEHIND the lavatory.
 *   4. No lip at all, sat on the front edge — but on a 232px board against a
 *      190px cat, so nothing of the board showed and she had a white column
 *      under her. In it again.
 *   5. Board widened, but with a 240px hole in it: 59px of dark opening either
 *      side of her waist. Down inside it.
 *
 * Two through-lines. Anything drawn across her body puts her body BEHIND that
 * thing, whatever her height says — so nothing is drawn over her at all now.
 * And what is not hidden by her has to be hidden by nothing: the board has to
 * be wider than she is and the hole narrower, or the fixture reads as a
 * container in whichever direction the numbers went wrong.
 *
 * What that buys has to be paid for somewhere, and it is paid for in the bowl:
 * sitting between the camera and the hole means the hole is behind her. She
 * gets down for that beat. The tests below pin both halves — the perch, and the
 * fact that what she leaves is invisible until she moves.
 *
 * All of it is arithmetic across files that have no reason to agree
 * (`rigLayout` places her bones, `HomeScene` lifts her, `looLayout` places the
 * porcelain), and none of it is visible in a screenshot of one screen width.
 */

import { describe, expect, it } from 'vitest';

import { DESIGN_HEIGHT, HEAD_RADIUS, PLACEMENTS } from '@/pet/rigLayout';
import {
  boardNearY,
  DEPOSIT,
  LOO_PET_RISE,
  looGeometry,
  stepAsideX,
  STEP_MIN_X,
} from '@/scenes/looLayout';
import { BATH_PET_RISE } from '@/scenes/bathLayout';

/** The scene HomeScene builds: canvas 860 less the 232px dock. */
const SCENE_HEIGHT = 628;
const PET_SCALE = (SCENE_HEIGHT * 0.55) / DESIGN_HEIGHT;
const STANDING_FEET_Y = SCENE_HEIGHT - 52;
/** Her rig origin while she is on the seat. */
const ORIGIN_Y = STANDING_FEET_Y - LOO_PET_RISE;

function room(width: number) {
  return { width, height: SCENE_HEIGHT, floorY: SCENE_HEIGHT * 0.7 };
}

/** Screen y of a rig-space y, while she is seated. */
const at = (rigY: number): number => ORIGIN_Y + rigY * PET_SCALE;
/** Screen y of a rig-space y, while she is standing on the floor. */
const atFloor = (rigY: number): number => STANDING_FEET_Y + rigY * PET_SCALE;

/* The ellipses `PetArt` draws, in rig units. The legs are back — they are what
 * lands on the front rim, and hiding them was version 2's mistake. */
const TORSO = { rx: 64, ry: 52 };
const LEG = { rx: 30, ry: 21 };

/** Vertical half-extent of an ellipse at horizontal offset `dx` from its centre. */
function halfHeightAt(dx: number, rx: number, ry: number): number | null {
  const u = dx / rx;
  if (Math.abs(u) >= 1) return null;
  return ry * Math.sqrt(1 - u * u);
}

/** Screen y of the LOWEST torso pixel in the column `dx` from the pet's centre. */
function torsoBottom(dx: number): number | null {
  const h = halfHeightAt(dx / PET_SCALE, TORSO.rx, TORSO.ry);
  return h === null ? null : at(PLACEMENTS.body.y + h);
}

/**
 * The bottom and top of her whole SILHOUETTE in the column `dx`: torso and
 * both legs together, whichever reaches furthest.
 *
 * Torso alone is not the shape that hides things. Her legs stick out below it
 * and, at the deposit's own width, they are what covers the last few pixels of
 * it — a test written against the torso rejects a picture that is fine.
 */
function silhouette(dx: number): { top: number; bottom: number } | null {
  const spans: Array<[number, number]> = [];
  const t = halfHeightAt(dx / PET_SCALE, TORSO.rx, TORSO.ry);
  if (t !== null) spans.push([at(PLACEMENTS.body.y - t), at(PLACEMENTS.body.y + t)]);
  for (const leg of [PLACEMENTS.legL, PLACEMENTS.legR]) {
    const h = halfHeightAt(dx / PET_SCALE - leg.x, LEG.rx, LEG.ry);
    if (h !== null) spans.push([at(leg.y - h), at(leg.y + h)]);
  }
  if (spans.length === 0) return null;
  return {
    top: Math.min(...spans.map((s) => s[0])),
    bottom: Math.max(...spans.map((s) => s[1])),
  };
}

/** Phone, the widest room column, and one in between. */
const WIDTHS = [420, 600, 940];

describe('she sits ON it, on the near edge', () => {
  /**
   * THE ONE THE OWNER CAUGHT BY EYE, THREE TIMES.
   *
   * Her bottom rests on the board's front rim — just above it, the way weight
   * on an edge looks. Below it and she is standing in front of the fixture;
   * far above it and she is floating, or back on the ring where version 3 put
   * her and it read as sitting behind the thing.
   */
  it.each(WIDTHS)('rests her bottom on the front rim (%ipx)', (width) => {
    const rim = boardNearY(looGeometry(room(width)));
    const drop = rim - (torsoBottom(0) as number);
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(24);
  });

  /**
   * And her back paws land ON the board, not past it.
   *
   * They hung over the rim for one render and it was wrong for a reason worth
   * keeping: below the rim the only thing behind them is the pedestal, which
   * is the same white as she is, so two flat white ovals merged straight into
   * it and she grew a stalk. On the board they sit against a cooler tone with
   * the front crescent's highlight running under them. The board is between
   * the hole's near rim and its own front edge, and that band is where they go.
   */
  it.each(WIDTHS)('lands her back paws on the board itself (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const pawBottom = at(PLACEMENTS.legL.y + LEG.ry);
    expect(pawBottom).toBeLessThan(boardNearY(loo));
    expect(pawBottom).toBeGreaterThan(loo.seatCY + loo.holeRy);
  });

  /**
   * Nothing is drawn over her, so the fixture has to read from what shows
   * AROUND her. The cistern is the piece that does it: it has to clear her
   * shoulders to be seen at all, and stay below the top of her head or it
   * turns into a wall behind a small cat.
   */
  it.each(WIDTHS)('shows the cistern over her shoulders (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const shoulders = at(PLACEMENTS.body.y - TORSO.ry);
    const headTop = at(PLACEMENTS.head.y - HEAD_RADIUS);
    expect(loo.lidTop).toBeLessThan(shoulders);
    expect(loo.lidTop).toBeGreaterThan(headTop);
    // And wide enough to show past her, which is her HEAD, not her waist.
    expect(134).toBeGreaterThan(HEAD_RADIUS * PET_SCALE + 30);
  });

  /**
   * The bowl must be narrower than she is. When it was not — 188px of pan
   * against 190px of cat, in the same white — the two merged into one shape
   * and no amount of shading separated them. The overhang IS the read.
   */
  it.each(WIDTHS)('sits her on a board that overhangs the bowl (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    expect(loo.seatRx - loo.panRx).toBeGreaterThan(30);
    const widest = HEAD_RADIUS * PET_SCALE;
    expect(loo.panRx).toBeLessThan(widest);
    expect(loo.seatRx).toBeGreaterThan(widest);
  });

  it.each(WIDTHS)('keeps her face well away from the porcelain (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    expect(loo.seatCY - at(PLACEMENTS.head.y + HEAD_RADIUS)).toBeGreaterThan(40);
  });
});

describe('the fixture fits the room', () => {
  it.each(WIDTHS)('stands on the floor rather than through it (%ipx)', (width) => {
    const geo = room(width);
    const loo = looGeometry(geo);
    expect(loo.seatCY).toBeGreaterThan(geo.floorY);
    expect(loo.groundY).toBeLessThanOrEqual(geo.height);
    expect(loo.lidTop).toBeLessThan(loo.cisternTop);
    expect(loo.cisternTop).toBeLessThan(loo.seatCY);
  });

  it.each(WIDTHS)('fits inside the room column (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    expect(loo.centreX - loo.seatRx).toBeGreaterThan(0);
    expect(loo.centreX + loo.seatRx).toBeLessThan(width);
  });

  /**
   * She is lifted LESS than the bath lifts her, and that inversion is the
   * whole of the fourth version in one number.
   *
   * You would guess the opposite — a seat is higher than a tub — and version 3
   * did guess it, at 115, which put her on the back of the board looking like
   * she was sitting behind the fixture. Sitting on the NEAR edge is a lower
   * perch than standing in a foot of water, because the edge is 44px in front
   * of the seat's centre line and 22px below its far rim. If this ever climbs
   * back above the tub, she has climbed back onto the ring.
   */
  it.each(WIDTHS)('perches her lower than the tub does (%ipx)', (width) => {
    expect(LOO_PET_RISE).toBeLessThan(BATH_PET_RISE);
    // But still up on the fixture rather than on the floor beside it.
    expect(at(0)).toBeLessThan(looGeometry(room(width)).groundY - 60);
    // The top of the rig's design space — ear tips and any hat above them.
    expect(at(-DESIGN_HEIGHT)).toBeGreaterThan(50);
  });
});

/**
 * The other half of the deal. She is between the camera and the hole while she
 * is on the seat, so what she leaves is genuinely invisible until she gets
 * down — not hidden by a trick, hidden by her. Both facts below are load
 * bearing: the first is why `HomeScene` moves her at all, the second is why
 * moving her is enough.
 */
describe('what she leaves, and when you get to see it', () => {
  it.each(WIDTHS)('drops it inside the opening, not on the board (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const top = loo.seatCY + DEPOSIT.offsetY - DEPOSIT.height / 2;
    const bottom = loo.seatCY + DEPOSIT.offsetY + DEPOSIT.height / 2;
    expect(top).toBeGreaterThan(loo.seatCY - loo.holeRy);
    expect(bottom).toBeLessThan(loo.seatCY + loo.holeRy);
    // And it has to fit through the hole it came out of.
    expect(DEPOSIT.width).toBeLessThan(loo.holeRx * 2);
  });

  /**
   * Not "mostly" behind her. A sliver of it poking out past her hip is worse
   * than showing the whole thing, because a smudge on a cat is a bug and a
   * pile in a bowl is a feature. Checked column by column across its width
   * rather than at one point, since her outline is three overlapping ellipses
   * and its narrowest cover is not necessarily at either end.
   */
  it.each(WIDTHS)('is completely behind her while she is seated (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const half = DEPOSIT.width / 2;
    const top = loo.seatCY + DEPOSIT.offsetY - DEPOSIT.height / 2;
    const bottom = loo.seatCY + DEPOSIT.offsetY + DEPOSIT.height / 2;
    for (let dx = -half; dx <= half; dx += 1) {
      const her = silhouette(dx);
      expect(her).not.toBeNull();
      expect((her as { top: number }).top).toBeLessThan(top);
      expect((her as { bottom: number }).bottom).toBeGreaterThan(bottom);
    }
  });

  /**
   * The hole has to disappear behind her too, and it is much wider than the
   * pile. Version 5 had 59px of dark opening either side of her waist and it
   * read as a pit she was down inside — the one failure mode that has come
   * back in some form in every version of this room.
   */
  it.each(WIDTHS)('hides the whole opening behind her waist (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    expect(loo.holeRx).toBeLessThan(TORSO.rx * PET_SCALE);
  });

  /**
   * And once she has stepped down it must be clear of her — of ALL of her.
   * The pile is drawn in FRONT of the pet (see `dropDeposit`) so that her tail
   * cannot wipe across it, which means anything of hers it overlaps, it draws
   * on top of. On a phone she is against the left bezel and the bowl is 94px
   * away; the nearest corner of the pile to her head clears it by single
   * digits, so this is checked rather than assumed.
   */
  it.each(WIDTHS)('is clear of her once she has stepped down (%ipx)', (width) => {
    const loo = looGeometry(room(width));
    const her = stepAsideX(loo);
    const headCX = her;
    const headCY = atFloor(PLACEMENTS.head.y);
    const r = HEAD_RADIUS * PET_SCALE;

    // Nearest point of the pile's box to the centre of her head.
    const nx = Math.max(loo.centreX - DEPOSIT.width / 2, Math.min(headCX, loo.centreX + DEPOSIT.width / 2));
    const ny = Math.max(
      loo.seatCY + DEPOSIT.offsetY - DEPOSIT.height / 2,
      Math.min(headCY, loo.seatCY + DEPOSIT.offsetY + DEPOSIT.height / 2),
    );
    expect(Math.hypot(nx - headCX, ny - headCY)).toBeGreaterThan(r);

    // Her torso, which is lower down and so the closer call in y.
    const torsoCY = atFloor(PLACEMENTS.body.y);
    const gapX = Math.abs(loo.centreX - DEPOSIT.width / 2 - her);
    const overlapY = Math.abs(torsoCY - loo.seatCY) < TORSO.ry * PET_SCALE + DEPOSIT.height / 2;
    if (overlapY) expect(gapX).toBeGreaterThan(TORSO.rx * PET_SCALE);
  });

  it.each(WIDTHS)('leaves her fully on screen when she steps aside (%ipx)', (width) => {
    const her = stepAsideX(looGeometry(room(width)));
    // Her widest point is her head, and it may not touch either bezel.
    expect(her - HEAD_RADIUS * PET_SCALE).toBeGreaterThan(0);
    expect(her + HEAD_RADIUS * PET_SCALE).toBeLessThan(width);
    expect(STEP_MIN_X).toBeGreaterThan(HEAD_RADIUS * PET_SCALE);
  });
});

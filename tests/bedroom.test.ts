/**
 * The bed, and the cat on it.
 *
 * Sleeping is the one pose where the pet's position is derived from a prop
 * rather than from the middle of the screen, and the two do not scale together:
 * the bed shrinks with the column, she does not. What is defended here is that
 * she lands on the bed and not beside it, on every screen the game builds for —
 * a thing that is invisible in a screenshot of the one size you happened to
 * look at.
 */

import { describe, expect, it } from 'vitest';

import { bedGeometry, duvetRun, type RoomBox } from '@/scenes/bedLayout';
import { SLEEP_ANGLE, SLEEP_HEAD_TILT, sleepRoot } from '@/pet/sleepPose';
import { DESIGN, designSizeFor, roomColumn } from '@/ui/theme';
import { DESIGN_HEIGHT, HEAD_RADIUS, PLACEMENTS, TORSO_HALF_WIDTH } from '@/pet/rigLayout';

/** Every window shape the game is built for, narrowest to widest. */
const WINDOWS = [
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1280, 800],
  [1920, 1080],
  [3440, 1440],
] as const;

/** What `HomeScene` builds, for a given window. */
function sceneFor(windowWidth: number, windowHeight: number) {
  const canvas = designSizeFor(windowWidth, windowHeight);
  const column = roomColumn(canvas.width);
  const sceneHeight = canvas.height - 232;
  const geo: RoomBox = { width: column.width, height: sceneHeight };
  return { canvas, column, geo, scale: (sceneHeight * 0.55) / DESIGN_HEIGHT };
}

describe('the bed', () => {
  it('fits inside the room column on every screen', () => {
    for (const [w, h] of WINDOWS) {
      const { geo } = sceneFor(w, h);
      const bed = bedGeometry(geo);
      expect(bed.left, `${w}x${h}`).toBeGreaterThan(0);
      expect(bed.right, `${w}x${h}`).toBeLessThan(geo.width);
      expect(bed.right - bed.left).toBe(bed.width);
    }
  });

  it('is centred, so she is not off to one side of the room', () => {
    for (const [w, h] of WINDOWS) {
      const { geo } = sceneFor(w, h);
      const bed = bedGeometry(geo);
      expect(Math.abs((bed.left + bed.right) / 2 - geo.width / 2)).toBeLessThanOrEqual(1);
    }
  });

  it('stops growing, so a wide screen does not get a bed with a speck on it', () => {
    const phone = bedGeometry(sceneFor(390, 844).geo);
    const ultrawide = bedGeometry(sceneFor(3440, 1440).geo);
    expect(ultrawide.width).toBeGreaterThan(phone.width);
    expect(ultrawide.width).toBeLessThanOrEqual(470);
  });
});

describe('where she lies', () => {
  it('puts her whole head on the mattress', () => {
    for (const [w, h] of WINDOWS) {
      const { geo, scale } = sceneFor(w, h);
      const bed = bedGeometry(geo);
      const radius = HEAD_RADIUS * scale;
      expect(bed.headX - radius, `${w}x${h} left`).toBeGreaterThan(bed.left - 20);
      expect(bed.headX + radius, `${w}x${h} right`).toBeLessThan(bed.right);
    }
  });

  it('rests her head ON the pillow rather than above or through it', () => {
    for (const [w, h] of WINDOWS) {
      const { geo, scale } = sceneFor(w, h);
      const bed = bedGeometry(geo);
      // The bottom of the skull should touch the mattress surface, give or
      // take: floating reads as levitation, buried reads as a hole in the bed.
      const chin = bed.headY + HEAD_RADIUS * scale;
      expect(chin - bed.surfaceY, `${w}x${h}`).toBeGreaterThan(-14);
      expect(chin - bed.surfaceY, `${w}x${h}`).toBeLessThan(30);
    }
  });

  /**
   * The pillow is 56% of the bed and starts at its left edge. If her head sits
   * on top of the whole thing there is no pillow left to see, and the pose
   * loses the one prop that says she is lying on something.
   */
  it('leaves the end of the pillow showing beside her', () => {
    for (const [w, h] of WINDOWS) {
      const { geo, scale } = sceneFor(w, h);
      const bed = bedGeometry(geo);
      const showing = bed.headX - HEAD_RADIUS * scale - bed.left;
      expect(showing, `${w}x${h}`).toBeGreaterThan(25);
    }
  });
});

describe('the duvet', () => {
  it('runs left to right on every bed, however short', () => {
    for (const [w, h] of WINDOWS) {
      const run = duvetRun(bedGeometry(sceneFor(w, h).geo));
      expect(run.to, `${w}x${h}`).toBeGreaterThan(run.from);
    }
  });

  /**
   * Her torso is a fixed 128 rig units wide centred a fixed distance down her
   * back, and the duvet is what hides the fact that the rig has been tipped
   * over. If the run is shorter than she is, the far end of her pokes out.
   */
  it('is long enough to cover a cat that does not shrink with the screen', () => {
    for (const [w, h] of WINDOWS) {
      const { geo, scale } = sceneFor(w, h);
      const bed = bedGeometry(geo);
      const run = duvetRun(bed);
      const root = sleepRoot({ x: bed.headX, y: bed.headY }, PLACEMENTS.head.y, scale);
      // Body centre, rotated out of rig space the same way the rig is.
      const rad = (SLEEP_ANGLE * Math.PI) / 180;
      const bodyX = root.x - PLACEMENTS.body.y * Math.sin(rad) * scale;
      const halfTorso = TORSO_HALF_WIDTH * scale;
      expect(run.from, `${w}x${h} chest`).toBeLessThan(bodyX - halfTorso + 30);
      expect(run.to, `${w}x${h} rump`).toBeGreaterThan(bodyX + halfTorso);
    }
  });
});

describe('the pose solver', () => {
  it('lands the head exactly where the bed asked for it', () => {
    const scale = 0.96;
    const target = { x: 400, y: 300 };
    const root = sleepRoot(target, PLACEMENTS.head.y, scale);

    // Rotate the head's rig-space offset by the sleep angle and add the root:
    // this is what Phaser does to a child of a rotated, scaled container.
    const rad = (SLEEP_ANGLE * Math.PI) / 180;
    const x = root.x + (0 * Math.cos(rad) - PLACEMENTS.head.y * Math.sin(rad)) * scale;
    const y = root.y + (0 * Math.sin(rad) + PLACEMENTS.head.y * Math.cos(rad)) * scale;

    expect(x).toBeCloseTo(target.x, 6);
    expect(y).toBeCloseTo(target.y, 6);
  });

  it('lays her down without standing her on her head', () => {
    // Body near horizontal, head near upright. The pair is the whole trick;
    // either one alone is a cat that has fallen over.
    expect(Math.abs(SLEEP_ANGLE)).toBeGreaterThan(65);
    expect(Math.abs(SLEEP_ANGLE)).toBeLessThan(90);
    expect(Math.abs(SLEEP_ANGLE + SLEEP_HEAD_TILT)).toBeLessThan(30);
  });

  it('puts her feet at the foot of the bed, not off the head of it', () => {
    // A flipped sign here mirrors the whole cat about the pillow and she ends
    // up lying on the headboard, which still reads as "a cat on a bed".
    const root = sleepRoot({ x: 0, y: 0 }, PLACEMENTS.head.y, 1);
    expect(root.x).toBeGreaterThan(150);
    expect(root.y).toBeGreaterThan(0);
  });
});

describe('the design space these are measured against', () => {
  it('is the one the scene actually builds', () => {
    // The scene subtracts a 232px dock from the design height; if that moves,
    // every number above is measured against the wrong room.
    expect(DESIGN.height).toBe(860);
    expect(sceneFor(390, 844).geo.height).toBe(628);
  });
});

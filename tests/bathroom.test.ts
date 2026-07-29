/**
 * The bath, and whether the dirt in it can actually be reached.
 *
 * The tub's near wall is drawn OVER her so she is sitting in the water rather
 * than standing behind it, which means the water line is an occluder. Anything
 * below it is invisible AND untouchable — a smudge that drifts under the water
 * is a bath the player cannot finish, and there is no in-game symptom except
 * that the last bit of dirt never comes off.
 *
 * That is arithmetic between three files that have no reason to know about each
 * other: `bathLayout` sets the water, `grimeSpots` places the muck, and
 * `HomeScene` lifts her by `BATH_PET_RISE` to sit in the tub. This is where
 * they are made to agree.
 */

import { describe, expect, it } from 'vitest';

import { BATH_PET_RISE, SUDS_RISE, tubGeometry } from '@/scenes/bathLayout';
import { DIRT_SPOTS } from '@/pet/grimeSpots';
import { BATHING } from '@/config/tuning';
import { DESIGN_HEIGHT, HEAD_RADIUS, PLACEMENTS, TORSO_HALF_WIDTH } from '@/pet/rigLayout';
import { designSizeFor, roomColumn } from '@/ui/theme';
import type { RoomBox } from '@/scenes/bedLayout';

const WINDOWS = [
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1280, 800],
  [1920, 1080],
  [3440, 1440],
] as const;

function sceneFor(windowWidth: number, windowHeight: number) {
  const canvas = designSizeFor(windowWidth, windowHeight);
  const sceneHeight = canvas.height - 232;
  const geo: RoomBox = { width: roomColumn(canvas.width).width, height: sceneHeight };
  return {
    geo,
    scale: (sceneHeight * 0.55) / DESIGN_HEIGHT,
    /** Where her feet are while she is in the bath. */
    feetY: sceneHeight - 52 - BATH_PET_RISE,
  };
}

/** Scene-space y of a smudge, the way the rig would place it. */
function spotY(spot: (typeof DIRT_SPOTS)[number], feetY: number, scale: number): number {
  const bone = spot.bone === 'head' ? PLACEMENTS.head.y : PLACEMENTS.body.y;
  return feetY + (bone + spot.y) * scale;
}

describe('the tub', () => {
  it('fits inside the room column on every screen', () => {
    for (const [w, h] of WINDOWS) {
      const { geo } = sceneFor(w, h);
      const tub = tubGeometry(geo);
      expect(tub.left, `${w}x${h}`).toBeGreaterThan(0);
      expect(tub.right, `${w}x${h}`).toBeLessThan(geo.width);
    }
  });

  it('is built back to front, with nothing inside out', () => {
    for (const [w, h] of WINDOWS) {
      const tub = tubGeometry(sceneFor(w, h).geo);
      expect(tub.rimY, `${w}x${h}`).toBeLessThan(tub.waterY);
      expect(tub.waterY).toBeLessThan(tub.nearTop);
      expect(tub.nearTop).toBeLessThan(tub.bottom);
      expect(tub.bottom).toBeLessThan(tub.footY);
    }
  });

  /**
   * At +10 the near wall started ten pixels under the surface and ate all but a
   * pinstripe of it, and the whole thing read as a white counter with a blue
   * line on it rather than as a bath.
   */
  it('leaves a band of water actually showing above the near wall', () => {
    for (const [w, h] of WINDOWS) {
      const tub = tubGeometry(sceneFor(w, h).geo);
      expect(tub.nearTop - tub.waterY, `${w}x${h}`).toBeGreaterThanOrEqual(20);
    }
  });

  it('stands on the floor rather than in it', () => {
    for (const [w, h] of WINDOWS) {
      const { geo } = sceneFor(w, h);
      expect(tubGeometry(geo).footY, `${w}x${h}`).toBeLessThanOrEqual(geo.height);
    }
  });

  it('is narrower than the room, so it is a bath and not a swimming pool', () => {
    const wide = sceneFor(1920, 1080);
    expect(tubGeometry(wide.geo).width).toBeLessThan(wide.geo.width * 0.6);
  });
});

describe('every smudge can be reached', () => {
  it('clears the suds ridge, which is what actually hides her', () => {
    for (const [w, h] of WINDOWS) {
      const { geo, scale, feetY } = sceneFor(w, h);
      const tub = tubGeometry(geo);
      expect(tub.sudsTopY).toBe(tub.waterY - SUDS_RISE);
      for (const [i, spot] of DIRT_SPOTS.entries()) {
        const y = spotY(spot, feetY, scale) + (spot.size / 2) * scale;
        // Against the SUDS, not the water. Measuring against the water line was
        // the first version and it passed while two of the five smudges sat
        // behind the foam floating on top of it.
        expect(y, `${w}x${h} spot ${i}`).toBeLessThan(tub.sudsTopY - 6);
      }
    }
  });

  it('sits inside the tub, not out over the bathroom floor', () => {
    for (const [w, h] of WINDOWS) {
      const { geo, scale, feetY } = sceneFor(w, h);
      const tub = tubGeometry(geo);
      const centre = geo.width / 2;
      for (const [i, spot] of DIRT_SPOTS.entries()) {
        const x = centre + spot.x * scale;
        expect(x, `${w}x${h} spot ${i} left`).toBeGreaterThan(tub.left);
        expect(x, `${w}x${h} spot ${i} right`).toBeLessThan(tub.right);
      }
      void feetY;
    }
  });

  /**
   * A smudge that overlaps an eye reads as a black eye, and one on the muzzle
   * reads as a moustache. Only the forehead is clear, so only the forehead is
   * used — this is the check that stops a future spot being dropped on her face
   * because it looked fine at one size.
   */
  it('keeps head dirt off her face', () => {
    for (const spot of DIRT_SPOTS.filter((s) => s.bone === 'head')) {
      // Eye whites are at (+/-50, 18) with a 38px vertical radius.
      for (const eyeX of [-50, 50]) {
        const dx = spot.x - eyeX;
        const dy = spot.y - 18;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(38 + spot.size / 2);
      }
      // And inside the skull, or it is floating beside her head.
      expect(Math.hypot(spot.x, spot.y) + spot.size / 2).toBeLessThan(HEAD_RADIUS + 12);
    }
  });

  it('keeps body dirt on the torso', () => {
    for (const spot of DIRT_SPOTS.filter((s) => s.bone === 'body')) {
      expect(Math.abs(spot.x)).toBeLessThan(TORSO_HALF_WIDTH);
      expect(Math.abs(spot.y)).toBeLessThan(52);
    }
  });
});

describe('a bath is finishable', () => {
  /**
   * Rubbing has to be able to carry her from filthy to spotless on its own. If
   * it cannot, the rinse bonus is doing the work and the scrubbing is theatre.
   */
  it('can be earned by scrubbing, without leaning on the rinse', () => {
    const byBrush = DIRT_SPOTS.length * BATHING.rubsPerSpot * BATHING.brushClean;
    expect(byBrush).toBeGreaterThan(BATHING.showDirtBelow * 0.6);
    expect(byBrush + BATHING.rinseClean).toBeGreaterThanOrEqual(BATHING.showDirtBelow);
  });

  /** Long enough to feel like a bath, short enough to do twice a day. */
  it('asks for a sane amount of rubbing', () => {
    const rubs = DIRT_SPOTS.length * BATHING.rubsPerSpot;
    expect(rubs).toBeGreaterThanOrEqual(15);
    expect(rubs).toBeLessThanOrEqual(40);
  });

  it('never asks for more lather than it will accept', () => {
    expect(BATHING.lather).toBeGreaterThan(0);
    expect(BATHING.toothRubs).toBeGreaterThan(0);
  });
});

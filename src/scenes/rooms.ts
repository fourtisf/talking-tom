/**
 * Room set dressing. Spec §9.
 *
 * Rooms are LAYERS inside `HomeScene`, not separate Phaser scenes — the pet
 * must never unload or reset when the player changes room. Each builder returns
 * a container that the scene cross-fades; the pet, HUD and dock are untouched.
 *
 * Props are vector primitives in the prototype's palette. Nothing here is
 * gameplay, so nothing here reads `tuning.ts`.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { bakeArt } from '@/ui/bake';
import { bedGeometry, duvetRun } from '@/scenes/bedLayout';
import { tubGeometry } from '@/scenes/bathLayout';
import type { RoomKey } from '@/core/types';

// Re-exported so callers keep getting the bed from the room module.
export { bedGeometry, duvetRun, type BedGeometry } from '@/scenes/bedLayout';
export { tubGeometry, type TubGeometry } from '@/scenes/bathLayout';

export interface RoomGeometry {
  width: number;
  height: number;
  /** Y of the wall/floor join. */
  floorY: number;
}

type RoomBuilder = (scene: Phaser.Scene, geo: RoomGeometry) => Phaser.GameObjects.Container;

/** Marks a child as animated, so `bakeStatic` leaves it alone. */
const ANIMATED = 'biskit.animated';

export function markAnimated<T extends Phaser.GameObjects.GameObject>(obj: T): T {
  obj.setData(ANIMATED, true);
  return obj;
}

/**
 * Flatten every static `Graphics` child into a single texture.
 *
 * Phaser re-tessellates and re-uploads a Graphics object on EVERY frame, so a
 * room full of them costs the same to draw standing still as it does moving.
 * Baking turns each room into one textured quad; the tweened children (clouds,
 * twinkling stars) stay live because they actually change.
 */
export function bakeStatic(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
): void {
  const statics = container.list.filter(
    (child): child is Phaser.GameObjects.Graphics =>
      child instanceof Phaser.GameObjects.Graphics && child.getData(ANIMATED) !== true,
  );
  if (statics.length === 0) return;

  const texture = scene.add.renderTexture(0, 0, width, height).setOrigin(0, 0);
  for (const graphics of statics) {
    texture.draw(graphics);
    container.remove(graphics, true);
  }
  container.addAt(texture, 0);
}

function outlined(
  g: Phaser.GameObjects.Graphics,
  fill: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  g.fillStyle(fill, 1);
  g.lineStyle(6, PALETTE.prop, 1);
  draw(g);
}

/**
 * Points along a quadratic curve.
 *
 * The duvet is the one prop here that a rounded rectangle cannot make: it has
 * to swell over the shape of a cat and settle back down at the foot of the bed,
 * and that mound is the whole reason the pose reads as sleeping rather than as
 * a cat that has fallen over.
 */
function curve(
  from: Phaser.Math.Vector2,
  control: Phaser.Math.Vector2,
  to: Phaser.Math.Vector2,
  steps = 16,
): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(
      new Phaser.Math.Vector2(
        u * u * from.x + 2 * u * t * control.x + t * t * to.x,
        u * u * from.y + 2 * u * t * control.y + t * t * to.y,
      ),
    );
  }
  return out;
}

const v = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);

const buildHome: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const cx = geo.width / 2;

  // Window with drifting clouds.
  //
  // The glass is drawn straight into the room (not into a sub-container) so it
  // bakes into the same texture as the frame, in the right order: baked art
  // always sits behind whatever stays live, and the frame must sit in front of
  // the glass.
  const winY = geo.height * 0.2;
  // Baked into its own texture, which crops the view to the pane — the hills
  // deliberately overflow and the texture bounds are what cuts them off.
  const glass = bakeArt(scene, 'room:home:window', { left: -79, top: -63, right: 79, bottom: 63 }, (g) => {
    g.fillStyle(0xc6eefb, 1);
    g.fillRoundedRect(-79, -63, 158, 126, 16);
    g.fillStyle(0x8fd8f2, 1);
    g.fillRoundedRect(-79, -63, 158, 60, { tl: 16, tr: 16, bl: 0, br: 0 });
    g.fillStyle(PALETTE.butter, 1);
    g.fillCircle(43, -45, 18);
    g.fillStyle(PALETTE.mint, 1);
    g.fillEllipse(-50, 68, 110, 60);
    g.fillStyle(0x3fbf97, 1);
    g.fillEllipse(55, 72, 110, 60);
  });
  glass.setPosition(cx, winY);
  room.add(glass);

  const mask = scene.make.graphics({});
  mask.fillRoundedRect(cx - 79, winY - 63, 158, 126, 16);

  for (const [i, spec] of ([
    [46, 17, -43, 24_000],
    [32, 12, -11, 36_000],
    [25, 10, 15, 30_000],
  ] as const).entries()) {
    const [w, h, y, duration] = spec;
    const cloud = scene.add.graphics();
    cloud.fillStyle(PALETTE.white, 0.9);
    cloud.fillRoundedRect(0, 0, w, h, h / 2);
    cloud.setPosition(cx - 129, winY + y);
    cloud.setMask(mask.createGeometryMask());
    room.add(markAnimated(cloud));
    scene.tweens.add({
      targets: cloud,
      x: cx + 110,
      duration,
      repeat: -1,
      delay: i * 8000,
      ease: 'Linear',
    });
  }

  // Frame last, so its mullions read over both the glass and the clouds.
  const frame = scene.add.graphics();
  frame.lineStyle(6, PALETTE.ink, 1);
  frame.strokeRoundedRect(cx - 79, winY - 63, 158, 126, 16);
  frame.lineBetween(cx, winY - 63, cx, winY + 63);
  frame.lineBetween(cx - 79, winY, cx + 79, winY);
  room.add(markAnimated(frame));

  // Shelf and books.
  const shelf = scene.add.graphics();
  outlined(shelf, 0xe0be93, (g) => {
    g.fillRoundedRect(16, geo.floorY - 190, 88, 11, 4);
  });
  room.add(shelf);
  const books = scene.add.graphics();
  for (const [x, h, color] of [
    [24, 28, 0xff8faf],
    [36, 36, 0x7fd9b8],
    [48, 24, 0xffd46b],
    [60, 32, 0xa88bd8],
  ] as const) {
    books.fillStyle(color, 1);
    books.lineStyle(3, PALETTE.prop, 1);
    books.fillRoundedRect(x, geo.floorY - 190 - h, 10, h, 2);
    books.strokeRoundedRect(x, geo.floorY - 190 - h, 10, h, 2);
  }
  room.add(books);

  // Picture frame.
  // Kept below y = 34% so it never sits under the shop/ad buttons.
  const pictureY = geo.height * 0.34;
  const picture = scene.add.graphics();
  outlined(picture, PALETTE.cream, (g) => {
    g.fillRoundedRect(geo.width - 80, pictureY, 62, 74, 8);
    g.strokeRoundedRect(geo.width - 80, pictureY, 62, 74, 8);
  });
  picture.fillStyle(PALETTE.grape, 1);
  picture.fillRoundedRect(geo.width - 72, pictureY + 8, 46, 58, 4);
  room.add(picture);

  // Plant.
  const plant = scene.add.graphics();
  plant.fillStyle(PALETTE.mint, 1);
  plant.lineStyle(6, PALETTE.prop, 1);
  plant.fillEllipse(40, geo.floorY - 56, 64, 76);
  plant.strokeEllipse(40, geo.floorY - 56, 64, 76);
  plant.fillStyle(PALETTE.butter, 1);
  plant.fillRoundedRect(16, geo.floorY - 22, 48, 38, { tl: 6, tr: 6, bl: 18, br: 18 });
  plant.strokeRoundedRect(16, geo.floorY - 22, 48, 38, { tl: 6, tr: 6, bl: 18, br: 18 });
  room.add(plant);

  // Rug.
  const rug = scene.add.graphics();
  rug.fillStyle(0xffc2d8, 1);
  rug.fillEllipse(cx, geo.height - 40, 250, 56);
  rug.lineStyle(10, 0xffa8c6, 1);
  rug.strokeEllipse(cx, geo.height - 40, 232, 40);
  room.add(rug);

  return room;
};

const buildKitchen: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const cx = geo.width / 2;

  const fridge = scene.add.graphics();
  outlined(fridge, 0xeff6f8, (g) => {
    g.fillRoundedRect(geo.width - 100, geo.floorY - 180, 88, 180, 14);
    g.strokeRoundedRect(geo.width - 100, geo.floorY - 180, 88, 180, 14);
  });
  fridge.lineStyle(6, PALETTE.ink, 1);
  fridge.lineBetween(geo.width - 100, geo.floorY - 124, geo.width - 12, geo.floorY - 124);
  fridge.fillStyle(PALETTE.ink, 1);
  fridge.fillRoundedRect(geo.width - 32, geo.floorY - 158, 8, 26, 4);
  room.add(fridge);

  const counter = scene.add.graphics();
  outlined(counter, PALETTE.cream, (g) => {
    g.fillRoundedRect(-10, geo.floorY - 52, geo.width + 20, 52, 12);
    g.strokeRoundedRect(-10, geo.floorY - 52, geo.width + 20, 52, 12);
  });
  room.add(counter);

  const bowl = scene.add.graphics();
  outlined(bowl, PALETTE.sky, (g) => {
    g.fillRoundedRect(cx - 43, geo.height - 108, 86, 40, { tl: 0, tr: 0, bl: 22, br: 22 });
    g.strokeRoundedRect(cx - 43, geo.height - 108, 86, 40, { tl: 0, tr: 0, bl: 22, br: 22 });
  });
  room.add(bowl);

  return room;
};

/* --------------------------- the bathroom -------------------------- */

const WATER = 0x7ecdf0;
const WATER_HI = 0xbfe9f8;
const PORCELAIN = 0xfffbf7;
const PORCELAIN_SH = 0xe4dced;

const buildBath: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const tub = tubGeometry(geo);
  const { left, rimY } = tub;

  const tiles = scene.add.graphics();
  tiles.lineStyle(4, PALETTE.white, 0.4);
  for (let y = 0; y < geo.floorY; y += 54) tiles.lineBetween(0, y, geo.width, y);
  for (let x = 0; x < geo.width; x += 54) tiles.lineBetween(x, 0, x, geo.floorY);
  room.add(tiles);

  // Shower on the left wall, on a real hose rather than a stub of pipe.
  const shower = scene.add.graphics();
  shower.lineStyle(9, 0xb0a2c8, 1);
  shower.strokePoints(
    curve(v(58, geo.height * 0.08), v(40, geo.height * 0.2), v(74, geo.height * 0.26), 12),
  );
  outlined(shower, 0xdfe6f2, (g) => {
    g.fillRoundedRect(46, geo.height * 0.26, 62, 22, 9);
    g.strokeRoundedRect(46, geo.height * 0.26, 62, 22, 9);
  });
  shower.fillStyle(0x6fc9ea, 0.7);
  for (let i = 0; i < 4; i++) shower.fillCircle(58 + i * 14, geo.height * 0.26 + 30, 4);
  room.add(shower);

  // Shelf of bottles, on the right where nothing else lives.
  const shelf = scene.add.graphics();
  outlined(shelf, 0xe0be93, (g) => {
    g.fillRoundedRect(geo.width - 132, geo.height * 0.3, 104, 12, 5);
    g.strokeRoundedRect(geo.width - 132, geo.height * 0.3, 104, 12, 5);
  });
  for (const [dx, h, body, cap] of [
    [10, 46, PALETTE.mint, 0x4fbe96],
    [40, 34, PALETTE.pink, 0xe877a8],
    [66, 40, PALETTE.butter, 0xdda524],
  ] as const) {
    const x = geo.width - 132 + dx;
    const top = geo.height * 0.3 - h;
    shelf.fillStyle(body, 1);
    shelf.lineStyle(4, PALETTE.prop, 1);
    shelf.fillRoundedRect(x, top, 20, h, 6);
    shelf.strokeRoundedRect(x, top, 20, h, 6);
    shelf.fillStyle(cap, 1);
    shelf.fillRoundedRect(x + 5, top - 9, 10, 10, 3);
  }
  room.add(shelf);

  /*
   * The tub is drawn TWICE: its far side here, behind her, and its near wall in
   * `buildTubFront` on top of her. That is the only way a front-facing rig ends
   * up inside a bath rather than standing behind one.
   */
  const basin = scene.add.graphics();
  outlined(basin, PORCELAIN, (g) => {
    g.fillRoundedRect(left, rimY, tub.width, tub.bottom - rimY, {
      tl: 30,
      tr: 30,
      bl: 54,
      br: 54,
    });
    g.strokeRoundedRect(left, rimY, tub.width, tub.bottom - rimY, {
      tl: 30,
      tr: 30,
      bl: 54,
      br: 54,
    });
  });
  // Inside of the far wall, so the tub has a hollow rather than being a slab.
  basin.fillStyle(WATER, 1);
  // Stops at the tub's own bottom. Run past it and the overhang shows below the
  // near wall as a blue sliver under the bath.
  basin.fillRoundedRect(left + 16, rimY + 16, tub.width - 32, tub.bottom - rimY - 22, 24);
  basin.fillStyle(WATER_HI, 0.5);
  basin.fillRoundedRect(left + 26, rimY + 24, tub.width - 52, 12, 6);
  room.add(basin);

  // Taps at the near end, on the left: her tail sweeps right and crossed them.
  const taps = scene.add.graphics();
  outlined(taps, 0xdfe6f2, (g) => {
    g.fillRoundedRect(left + 34, rimY - 46, 18, 52, 7);
    g.strokeRoundedRect(left + 34, rimY - 46, 18, 52, 7);
    g.fillRoundedRect(left + 18, rimY - 54, 50, 18, 9);
    g.strokeRoundedRect(left + 18, rimY - 54, 50, 18, 9);
    g.fillRoundedRect(left + 60, rimY - 26, 26, 12, 6);
    g.strokeRoundedRect(left + 60, rimY - 26, 26, 12, 6);
  });
  room.add(taps);

  return room;
};

/**
 * The near wall of the tub, the water in it, and what floats on top — all drawn
 * ABOVE the pet.
 *
 * Same trick as the duvet. Behind her, a bath is a prop she is standing in
 * front of; in front of her, she is in it. The water line is set by
 * `tubGeometry` and is the reason every smudge sits on her upper half.
 */
export function buildTubFront(scene: Phaser.Scene, geo: RoomGeometry): Phaser.GameObjects.Container {
  const layer = scene.add.container(0, 0);
  const tub = tubGeometry(geo);
  const { left, right, waterY, nearTop } = tub;

  const water = scene.add.graphics();

  // Surface: a wavy band, so the water has a top edge rather than a ruled line.
  const surface: Phaser.Math.Vector2[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    surface.push(v(left + 14 + (tub.width - 28) * t, waterY + Math.sin(t * Math.PI * 5) * 5));
  }
  water.fillStyle(WATER, 0.92);
  water.fillPoints([...surface, v(right - 14, nearTop + 30), v(left + 14, nearTop + 30)], true);
  water.lineStyle(5, WATER_HI, 1);
  water.strokePoints(surface, false);
  layer.add(water);

  /*
   * The near side, in two pieces: a rolled rim and then the face below it.
   *
   * One rounded rectangle for the whole thing is what made the first tub read
   * as a bathroom counter — 78px of unbroken white with a highlight across it
   * has no lip, and a bath without a lip is a box. The rim is what says the
   * water is contained by something.
   */
  const wall = scene.add.graphics();
  const faceTop = nearTop + 18;
  /*
   * FULL WIDTH, not inset. An inset face let the basin's own water fill show
   * around it as a blue halo down both sides of the tub — the near wall's job
   * is to cover everything below the water line, so it has to reach the edges.
   */
  outlined(wall, PORCELAIN, (g) => {
    g.fillRoundedRect(left, faceTop, tub.width, tub.bottom - faceTop, { bl: 52, br: 52 });
    g.strokeRoundedRect(left, faceTop, tub.width, tub.bottom - faceTop, { bl: 52, br: 52 });
  });
  wall.fillStyle(PORCELAIN_SH, 0.7);
  wall.fillRoundedRect(left + 8, tub.bottom - 40, tub.width - 16, 32, { bl: 44, br: 44 });
  // One band of colour across the face, so it is a bath and not a blank panel.
  wall.fillStyle(0x8fd8f2, 0.5);
  wall.fillRoundedRect(left + 24, faceTop + 26, tub.width - 48, 10, 5);

  outlined(wall, PORCELAIN, (g) => {
    g.fillRoundedRect(left - 10, nearTop, tub.width + 20, 32, 16);
    g.strokeRoundedRect(left - 10, nearTop, tub.width + 20, 32, 16);
  });
  wall.fillStyle(PALETTE.white, 1);
  wall.fillRoundedRect(left - 2, nearTop + 5, tub.width + 4, 12, 6);
  layer.add(wall);

  // Feet, in FRONT of the near wall — behind it they were two grey nubs.
  const feet = scene.add.graphics();
  outlined(feet, PORCELAIN_SH, (g) => {
    for (const x of [left + 26, right - 80]) {
      g.fillRoundedRect(x, tub.bottom - 12, 54, tub.footY - tub.bottom + 12, {
        tl: 6,
        tr: 6,
        bl: 18,
        br: 18,
      });
      g.strokeRoundedRect(x, tub.bottom - 12, 54, tub.footY - tub.bottom + 12, {
        tl: 6,
        tr: 6,
        bl: 18,
        br: 18,
      });
    }
  });
  layer.add(feet);

  /*
   * Suds on the water: a scalloped ridge, not a row of circles.
   *
   * Six separate outlined circles along the water line read as ping-pong balls
   * floating in a trough. Foam is one mass with a bumpy edge, so it is drawn as
   * one filled shape whose top is a run of overlapping arcs.
   */
  const suds = scene.add.graphics();
  const bumps = Math.max(6, Math.round(tub.width / 46));
  const ridge: Phaser.Math.Vector2[] = [];
  // Derived from `sudsTopY`, so the highest crest is exactly the line the tests
  // keep the dirt above. A ridge that quietly grew past it would hide smudges
  // the player is being asked to find.
  const foot = 10;
  const jitter = 4;
  const crest = tub.waterY - tub.sudsTopY - foot - jitter;
  for (let i = 0; i <= bumps * 6; i++) {
    const t = i / (bumps * 6);
    const x = left + 8 + (tub.width - 16) * t;
    // Two frequencies, so the crests are not a perfect repeat.
    const y = waterY - foot - Math.abs(Math.sin(t * Math.PI * bumps)) * crest - Math.sin(t * 9) * jitter;
    ridge.push(v(x, y));
  }
  suds.fillStyle(PALETTE.white, 1);
  suds.fillPoints([...ridge, v(left + 8, waterY + 20), v(right - 8, waterY + 20)], true);
  suds.lineStyle(5, 0xd8ecf7, 1);
  suds.strokePoints(ridge, false);
  layer.add(suds);

  const duck = scene.add.graphics();
  const dx = left + tub.width * 0.82;
  const dy = waterY - 12;
  outlined(duck, PALETTE.butter, (g) => {
    g.fillEllipse(dx, dy, 62, 42);
    g.strokeEllipse(dx, dy, 62, 42);
    g.fillCircle(dx + 18, dy - 24, 18);
    g.strokeCircle(dx + 18, dy - 24, 18);
  });
  duck.fillStyle(PALETTE.butter, 1);
  duck.fillCircle(dx + 18, dy - 24, 15);
  duck.fillEllipse(dx, dy, 56, 36);
  duck.fillStyle(0xff9a5b, 1);
  duck.fillEllipse(dx + 36, dy - 22, 20, 10);
  duck.fillStyle(PALETTE.ink, 1);
  duck.fillCircle(dx + 24, dy - 28, 3);
  layer.add(duck);

  bakeStatic(scene, layer, geo.width, geo.height);
  return layer;
}

/* --------------------------- the bedroom --------------------------- */

/** Warm wood — the one thing in a lilac room that is not lilac. */
const WOOD = 0xd2a074;
const WOOD_SH = 0xa9794f;
const WOOD_HI = 0xecc79d;

const DUVET = 0x9b7fd0;
const DUVET_SH = 0x7f63b4;
const DUVET_FOLD = 0xcbbaf0;

const PILLOW = 0xffc4d6;
const PILLOW_HI = 0xffe1ea;
const PILLOW_SH = 0xf3a0bd;

const buildBed: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const bed = bedGeometry(geo);
  const { left, right, surfaceY } = bed;
  const legBottom = geo.height - 34;

  // Left of centre so the side buttons never eclipse it.
  const moon = scene.add.graphics();
  moon.fillStyle(PALETTE.butter, 0.25);
  moon.fillCircle(geo.width * 0.2, geo.height * 0.13, 52);
  moon.fillStyle(PALETTE.butter, 1);
  moon.fillCircle(geo.width * 0.2, geo.height * 0.13, 31);
  room.add(moon);

  for (const [fx, fy, delay] of [
    [0.16, 0.13, 0],
    [0.32, 0.23, 700],
    [0.6, 0.1, 1300],
    [0.8, 0.29, 400],
  ] as const) {
    const star = scene.add.graphics();
    star.fillStyle(PALETTE.white, 1);
    star.fillCircle(0, 0, 3);
    star.setPosition(geo.width * fx, geo.height * fy);
    room.add(markAnimated(star));
    scene.tweens.add({
      targets: star,
      alpha: { from: 0.2, to: 1 },
      scale: { from: 0.6, to: 1.4 },
      duration: 1300,
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Rug, so the bed stands on something instead of floating on bare boards.
  const rug = scene.add.graphics();
  rug.fillStyle(0x9d84cf, 1);
  rug.fillEllipse(geo.width / 2, legBottom + 12, bed.width + 150, 62);
  rug.lineStyle(8, 0x8a70bd, 1);
  rug.strokeEllipse(geo.width / 2, legBottom + 12, bed.width + 108, 40);
  room.add(rug);

  /*
   * Drawn back to front, as a side elevation: headboard, then the frame the
   * mattress drops into, then the mattress, the pillow, and finally the
   * footboard — which has to come last because in a side view the near end
   * panel occludes the end of the mattress.
   */
  const headboard = scene.add.graphics();
  outlined(headboard, WOOD, (g) => {
    g.fillRoundedRect(left - 22, surfaceY - 138, 66, 208, { tl: 30, tr: 30, bl: 6, br: 6 });
    g.strokeRoundedRect(left - 22, surfaceY - 138, 66, 208, { tl: 30, tr: 30, bl: 6, br: 6 });
  });
  headboard.fillStyle(WOOD_HI, 1);
  headboard.fillRoundedRect(left - 12, surfaceY - 126, 46, 92, { tl: 22, tr: 22, bl: 8, br: 8 });
  headboard.fillStyle(WOOD_SH, 0.5);
  headboard.fillRoundedRect(left + 26, surfaceY - 126, 10, 180, 5);
  room.add(headboard);

  const frame = scene.add.graphics();
  // Legs first, so the rail's outline crosses their tops.
  outlined(frame, WOOD_SH, (g) => {
    for (const x of [left + 12, right - 44]) {
      g.fillRoundedRect(x, surfaceY + 60, 32, legBottom - surfaceY - 60, { bl: 8, br: 8 });
      g.strokeRoundedRect(x, surfaceY + 60, 32, legBottom - surfaceY - 60, { bl: 8, br: 8 });
    }
  });
  outlined(frame, WOOD, (g) => {
    g.fillRoundedRect(left - 8, surfaceY + 40, bed.width + 16, 46, 12);
    g.strokeRoundedRect(left - 8, surfaceY + 40, bed.width + 16, 46, 12);
  });
  frame.fillStyle(WOOD_SH, 0.45);
  frame.fillRoundedRect(left - 2, surfaceY + 68, bed.width + 4, 12, 6);
  room.add(frame);

  const mattress = scene.add.graphics();
  outlined(mattress, PALETTE.cream, (g) => {
    g.fillRoundedRect(left, surfaceY, bed.width, 56, 18);
    g.strokeRoundedRect(left, surfaceY, bed.width, 56, 18);
  });
  // Fitted sheet: a band of colour along the bottom edge, tucked under.
  mattress.fillStyle(0xe6dbf7, 1);
  mattress.fillRoundedRect(left + 4, surfaceY + 32, bed.width - 8, 22, { bl: 14, br: 14 });
  mattress.lineStyle(4, PALETTE.prop, 0.55);
  mattress.lineBetween(left + 10, surfaceY + 32, left + bed.width - 10, surfaceY + 32);
  room.add(mattress);

  const pillowW = Math.round(bed.width * 0.56);
  const pillow = scene.add.graphics();
  outlined(pillow, PILLOW, (g) => {
    g.fillRoundedRect(left - 4, surfaceY - 112, pillowW, 120, 46);
    g.strokeRoundedRect(left - 4, surfaceY - 112, pillowW, 120, 46);
  });
  pillow.fillStyle(PILLOW_HI, 1);
  pillow.fillRoundedRect(left + 12, surfaceY - 100, pillowW - 34, 54, 27);
  pillow.fillStyle(PILLOW_SH, 0.5);
  pillow.fillRoundedRect(left + 16, surfaceY - 22, pillowW - 40, 16, 8);
  // Seam down the near end, so a rounded rectangle reads as something stuffed.
  pillow.lineStyle(4, PILLOW_SH, 0.8);
  pillow.strokePoints(
    curve(v(left + 30, surfaceY - 104), v(left + 6, surfaceY - 52), v(left + 30, surfaceY), 10),
  );
  room.add(pillow);

  const footboard = scene.add.graphics();
  outlined(footboard, WOOD, (g) => {
    g.fillRoundedRect(right - 42, surfaceY - 34, 62, 108, { tl: 20, tr: 20, bl: 6, br: 6 });
    g.strokeRoundedRect(right - 42, surfaceY - 34, 62, 108, { tl: 20, tr: 20, bl: 6, br: 6 });
  });
  footboard.fillStyle(WOOD_HI, 1);
  footboard.fillRoundedRect(right - 32, surfaceY - 24, 42, 34, { tl: 14, tr: 14, bl: 6, br: 6 });
  room.add(footboard);

  // A bedside table, only where there is honestly room for one. On a phone the
  // bed already fills the column and this would sit under the side buttons.
  if (geo.width - bed.width >= 250) {
    const table = scene.add.graphics();
    outlined(table, WOOD, (g) => {
      g.fillRoundedRect(right + 40, surfaceY + 6, 104, 96, 12);
      g.strokeRoundedRect(right + 40, surfaceY + 6, 104, 96, 12);
    });
    table.fillStyle(WOOD_SH, 0.45);
    table.fillRoundedRect(right + 52, surfaceY + 44, 80, 12, 6);
    table.fillStyle(WOOD_SH, 1);
    table.fillRoundedRect(right + 50, surfaceY + 98, 14, legBottom - surfaceY - 98, { bl: 6, br: 6 });
    table.fillRoundedRect(right + 120, surfaceY + 98, 14, legBottom - surfaceY - 98, { bl: 6, br: 6 });
    room.add(table);

    /*
     * The lamp STANDS ON the table. The first version put its foot 28px above
     * the tabletop and the shade came out as a traffic cone hanging in the air
     * — the one detail that has to be right is where the bottom of it is.
     */
    const foot = surfaceY + 8;
    const lamp = scene.add.graphics();
    // Glow first, so the shade's outline sits on top of it rather than under.
    lamp.fillStyle(PALETTE.butter, 0.14);
    lamp.fillCircle(right + 92, foot - 58, 74);
    lamp.fillStyle(PALETTE.butter, 0.18);
    lamp.fillCircle(right + 92, foot - 58, 46);
    outlined(lamp, WOOD_HI, (g) => {
      g.fillRoundedRect(right + 74, foot - 12, 36, 12, 5);
      g.strokeRoundedRect(right + 74, foot - 12, 36, 12, 5);
      g.fillRoundedRect(right + 87, foot - 46, 10, 36, 3);
      g.strokeRoundedRect(right + 87, foot - 46, 10, 36, 3);
    });
    // Shade: a trapezoid, not a triangle. A cone has no top and reads as a hat.
    outlined(lamp, PALETTE.butter, (g) => {
      const shade = [
        v(right + 62, foot - 44),
        v(right + 76, foot - 88),
        v(right + 108, foot - 88),
        v(right + 122, foot - 44),
      ];
      g.fillPoints(shade, true);
      g.strokePoints(shade, true);
    });
    lamp.fillStyle(0xfff0c2, 1);
    lamp.fillPoints(
      [v(right + 72, foot - 48), v(right + 82, foot - 82), v(right + 92, foot - 82), v(right + 88, foot - 48)],
      true,
    );
    room.add(lamp);
  }

  return room;
};

/**
 * The duvet, drawn OVER her.
 *
 * This is what makes a front-facing rig read as a cat asleep in bed. Tipped on
 * its side, the rig is a cat that has fallen over — two arms, two legs and a
 * tail all pointing the wrong way. Under a blanket none of that is visible:
 * what is left is a head on a pillow and a mound the size of a cat, which is
 * exactly what a sleeping cat looks like from across the room.
 *
 * Lives outside the room layer because it has to sit ABOVE `DEPTH.pet`, and a
 * room layer is one flat texture behind her.
 */
export function buildBlanket(scene: Phaser.Scene, geo: RoomGeometry): Phaser.GameObjects.Container {
  const layer = scene.add.container(0, 0);
  const bed = bedGeometry(geo);
  const { surfaceY } = bed;

  const run = duvetRun(bed);
  const tuck = v(run.from, surfaceY + 18);
  const dRight = run.to;
  const hemY = surfaceY + 58;

  /*
   * TWO humps, not one arc.
   *
   * A single curve over the whole cat came out as an igloo — smooth, symmetric
   * and clearly a shape rather than a covered animal. What is under there has a
   * shoulder and a hip, so the top edge rises steeply off the pillow, crests
   * over her shoulders, dips at the waist and rises again over her hindquarters
   * before running out at the foot of the bed.
   *
   * Sited as fractions of the run, not at fixed offsets from her head: the bed
   * shrinks with the screen and she does not, and hard-coded offsets put the
   * hip past the foot of a phone-sized bed, which folds the curve back on
   * itself.
   */
  const span = dRight - tuck.x;
  const at = (fraction: number, y: number) => v(tuck.x + span * fraction, surfaceY + y);
  // The dip between them is 14px, not 40. Deeper and the two humps stop being
  // one animal under a blanket and start being a camel.
  const shoulder = at(0.27, -118);
  const waist = at(0.52, -104);
  const hip = at(0.75, -110);
  const top = [
    // The control point is high on purpose: pulled down, the rise arrives at
    // the shoulder still climbing while the next curve leaves it descending,
    // and the two meet in a spike you cannot unsee.
    ...curve(tuck, at(0.035, -102), shoulder),
    ...curve(shoulder, at(0.4, -100), waist).slice(1),
    ...curve(waist, at(0.64, -114), hip).slice(1),
    ...curve(hip, at(0.89, -56), v(dRight, surfaceY - 6)).slice(1),
  ];

  // Hem: a soft scallop rather than a ruled line, so the blanket hangs.
  const hem: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = dRight + (tuck.x + 34 - dRight) * t;
    hem.push(v(x, hemY + Math.sin(t * Math.PI * 4) * 5));
  }

  const outline = [
    ...top,
    ...curve(v(dRight, surfaceY - 6), v(dRight + 16, hemY), v(dRight - 10, hemY), 8).slice(1),
    ...hem.slice(1),
    ...curve(v(tuck.x + 34, hemY), v(tuck.x - 4, hemY - 14), tuck, 8).slice(1),
  ];

  const duvet = scene.add.graphics();
  duvet.fillStyle(DUVET, 1);
  duvet.fillPoints(outline, true);

  // Shade along the hem, where a hanging blanket goes dark. An earlier version
  // shaded the whole lower half by pairing the crest with a slice of the
  // outline, and the slice did not line up: the polygon spilled out past the
  // silhouette as a translucent flap.
  duvet.fillStyle(DUVET_SH, 0.3);
  duvet.fillPoints([...hem, ...[...hem].reverse().map((p) => v(p.x, p.y - 34))], true);

  /*
   * The turned-down top sheet, up the leading edge only.
   *
   * Run the whole length it reads as a rim light on a dome. Carried over the
   * crest it reads as a hood. What it has to follow is the near-vertical rise
   * off the pillow — that is where bedding actually folds back, and it is the
   * detail that says somebody tucked her in.
   */
  const crest = top.slice(0, Math.round(top.length * 0.3));
  const fold = [...crest, ...crest.map((p) => v(p.x + 34, p.y + 30)).reverse()];
  duvet.fillStyle(DUVET_FOLD, 1);
  duvet.fillPoints(fold, true);
  duvet.lineStyle(5, PALETTE.line, 0.85);
  duvet.strokePoints(fold.slice(crest.length - 1), false);

  // Creases falling off the crest.
  duvet.lineStyle(5, DUVET_SH, 0.45);
  for (const [x, lean] of [
    [waist.x + 6, 14],
    [hip.x + 46, 20],
  ] as const) {
    duvet.strokePoints(curve(v(x, surfaceY - 74), v(x + lean, surfaceY - 20), v(x + lean - 6, hemY - 14), 10));
  }

  duvet.lineStyle(6, PALETTE.line, 1);
  duvet.strokePoints(outline, true);

  /*
   * NO PAW OVER THE BLANKET, deliberately.
   *
   * A forepaw out over the duvet is the obvious charming detail and it was
   * tried three ways, each of which failed for the same reason: there is
   * nothing for it to be attached to. Behind the duvet it vanishes; on top of
   * it, it is a white oval with a pink print in the middle, which reads as a
   * sticker rather than as part of the cat. Burying the arm's root behind the
   * turned-down sheet does not work either — along the leading edge the duvet
   * is steep and thin, so an arm thick enough to see pokes out through the
   * silhouette above the fold. It would need a bump in the duvet's own outline
   * to work, and the scene does not need it.
   */
  layer.add(duvet);

  bakeStatic(scene, layer, geo.width, geo.height);
  return layer;
}

const BUILDERS: Readonly<Record<Exclude<RoomKey, 'play'>, RoomBuilder>> = {
  home: buildHome,
  kitchen: buildKitchen,
  bath: buildBath,
  bed: buildBed,
};

/** Build every room layer up front. Swapping rooms is then a cross-fade. */
export function buildRoomLayers(
  scene: Phaser.Scene,
  geo: RoomGeometry,
): Map<RoomKey, Phaser.GameObjects.Container> {
  const layers = new Map<RoomKey, Phaser.GameObjects.Container>();
  for (const key of Object.keys(BUILDERS) as (keyof typeof BUILDERS)[]) {
    const layer = BUILDERS[key](scene, geo);
    bakeStatic(scene, layer, geo.width, geo.height);
    // Alpha 0 still costs a render pass; `visible` is what actually skips it.
    layer.setAlpha(0).setVisible(false);
    layers.set(key, layer);
  }
  return layers;
}

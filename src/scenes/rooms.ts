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
import type { RoomKey } from '@/core/types';

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

const buildBath: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const cx = geo.width / 2;

  const tiles = scene.add.graphics();
  tiles.lineStyle(4, PALETTE.white, 0.4);
  for (let y = 0; y < geo.floorY; y += 54) tiles.lineBetween(0, y, geo.width, y);
  for (let x = 0; x < geo.width; x += 54) tiles.lineBetween(x, 0, x, geo.floorY);
  room.add(tiles);

  // Left wall, clear of the side buttons.
  const shower = scene.add.graphics();
  outlined(shower, 0xd9e6ea, (g) => {
    g.fillRoundedRect(34, geo.height * 0.18, 52, 20, 8);
    g.strokeRoundedRect(34, geo.height * 0.18, 52, 20, 8);
  });
  shower.lineStyle(4, PALETTE.prop, 1);
  shower.lineBetween(60, geo.height * 0.18, 60, geo.height * 0.1);
  room.add(shower);

  const tub = scene.add.graphics();
  outlined(tub, PALETTE.cream, (g) => {
    g.fillRoundedRect(cx - 135, geo.height - 160, 270, 126, {
      tl: 24,
      tr: 24,
      bl: 62,
      br: 62,
    });
    g.strokeRoundedRect(cx - 135, geo.height - 160, 270, 126, {
      tl: 24,
      tr: 24,
      bl: 62,
      br: 62,
    });
  });
  tub.fillStyle(0x6fc9ea, 1);
  tub.lineStyle(4, PALETTE.ink, 1);
  tub.fillRoundedRect(cx - 121, geo.height - 148, 242, 44, 14);
  tub.strokeRoundedRect(cx - 121, geo.height - 148, 242, 44, 14);
  room.add(tub);

  return room;
};

const buildBed: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const cx = geo.width / 2;

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

  const bed = scene.add.graphics();
  outlined(bed, PALETTE.grape, (g) => {
    g.fillRoundedRect(cx - 145, geo.height - 140, 290, 104, 20);
    g.strokeRoundedRect(cx - 145, geo.height - 140, 290, 104, 20);
  });
  bed.fillStyle(0xc3b2ec, 1);
  bed.fillRoundedRect(cx - 145, geo.height - 144, 290, 34, { tl: 16, tr: 16, bl: 0, br: 0 });
  bed.lineStyle(6, PALETTE.ink, 1);
  bed.lineBetween(cx - 145, geo.height - 110, cx + 145, geo.height - 110);
  room.add(bed);

  const pillow = scene.add.graphics();
  outlined(pillow, PALETTE.cream, (g) => {
    g.fillRoundedRect(cx - 125, geo.height - 168, 86, 44, 16);
    g.strokeRoundedRect(cx - 125, geo.height - 168, 86, 44, 16);
  });
  room.add(pillow);

  return room;
};

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

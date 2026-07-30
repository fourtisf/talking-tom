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
import { PLATE_HEIGHT, PLATE_WIDTH, tableGeometry } from '@/scenes/tableLayout';
import { DEPOSIT, looGeometry } from '@/scenes/looLayout';
import type { RoomKey } from '@/core/types';

// Re-exported so callers keep getting the bed from the room module.
export { bedGeometry, duvetRun, type BedGeometry } from '@/scenes/bedLayout';
export { tubGeometry, type TubGeometry } from '@/scenes/bathLayout';
export { tableGeometry, type TableGeometry } from '@/scenes/tableLayout';
export { looGeometry, occluderTopY, type LooGeometry } from '@/scenes/looLayout';

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

  /*
   * The litter tray.
   *
   * In the LIVING ROOM, which is not where I wanted it. The bathroom is
   * thematically right and it does not fit: `tubGeometry` fills essentially
   * the whole bathroom floor, leaving thirty pixels below the tub and wall
   * above it. Here the bottom-right corner is genuinely free — the plant owns
   * x 16-64, the rug is an ellipse centred on the middle of the floor, and her
   * tap target is 211 wide around it — and a litter tray in the corner of a
   * living room is also just what a cat's litter tray looks like.
   *
   * `litterSpot` is exported so `HomeScene` can put the tap target on it
   * without either of them owning a copy of these numbers.
   */
  const tray = litterSpot(geo);
  const litter = scene.add.graphics();
  outlined(litter, 0xcdbde8, (g) => {
    g.fillRoundedRect(tray.left, tray.top, tray.width, tray.height, {
      tl: 6,
      tr: 6,
      bl: 16,
      br: 16,
    });
    g.strokeRoundedRect(tray.left, tray.top, tray.width, tray.height, {
      tl: 6,
      tr: 6,
      bl: 16,
      br: 16,
    });
  });
  // The litter itself, a shade paler and set into the tray so the rim reads.
  litter.fillStyle(0xf0e7fb, 1);
  litter.fillRoundedRect(tray.left + 9, tray.top + 7, tray.width - 18, 13, 5);
  litter.fillStyle(0xdcd0f0, 1);
  for (const [dx, dy] of [
    [14, 15],
    [30, 11],
    [48, 16],
    [66, 12],
  ] as const) {
    litter.fillCircle(tray.left + dx, tray.top + dy, 3.5);
  }
  // A paw print pressed into it, matching the icon on the tray tile. A scoop
  // was tried first and, blade-down at this size, read as a download arrow.
  litter.fillStyle(0xb3a1d6, 1);
  litter.fillEllipse(tray.centreX + 8, tray.top + 26, 22, 14);
  for (const [dx, dy] of [
    [-2, 16],
    [8, 13],
    [18, 16],
  ] as const) {
    litter.fillCircle(tray.centreX + dx, tray.top + dy, 4.4);
  }
  room.add(litter);

  return room;
};

export interface LitterSpot {
  left: number;
  top: number;
  width: number;
  height: number;
  centreX: number;
  centreY: number;
}

/**
 * Where the litter tray sits in the living room.
 *
 * Bottom-right, clear of the rug and of her tap target. Exported because
 * `HomeScene` puts a tap target on it and the two must not each carry their own
 * copy of the numbers.
 */
export function litterSpot(geo: RoomGeometry): LitterSpot {
  const width = 96;
  const height = 46;
  const left = Math.round(geo.width - width - 34);
  const top = Math.round(geo.height - height - 58);
  return { left, top, width, height, centreX: left + width / 2, centreY: top + height / 2 };
}

/**
 * What she leaves in the bowl.
 *
 * Stylised to the point of being a logo — three stacked rounded lumps and a
 * highlight, no texture, no detail. The room was originally drawn with a rule
 * that there be no brown anywhere in it; the owner asked for this, so the rule
 * is theirs to set and this is the smallest, tidiest shape that reads as what
 * it is at 44px.
 *
 * Sized and placed to fill the hole exactly: 30 tall centred 2px below the
 * board's centre line, so its top meets the hole's far rim and its bottom
 * three pixels tuck behind the near lip. `tests/lavatory.test.ts` checks that
 * it clears the lip, because a deposit you cannot see is a tap with no result.
 */
export function buildDeposit(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const pile = scene.add.container(x, y);
  const g = scene.add.graphics();
  // The art is drawn 44 wide; `DEPOSIT.width` is what it has to come out as,
  // and that number is the one `tests/lavatory.test.ts` checks against the
  // lip. At the first size only 26px of it cleared, and it read as a smudge at
  // the back of the bowl rather than as a result.
  g.setScale(DEPOSIT.width / 44);
  g.lineStyle(5, 0x5b3d1c, 1);
  g.fillStyle(0x8a6234, 1);
  for (const [dx, dy, rx, ry] of [
    [0, 9, 22, 8],
    [-2, 1, 17, 7],
    [1, -6, 11, 6],
  ] as const) {
    g.fillEllipse(dx, dy, rx * 2, ry * 2);
    g.strokeEllipse(dx, dy, rx * 2, ry * 2);
  }
  // Re-fill over the seams so it is one solid mass rather than three rings.
  g.fillStyle(0x8a6234, 1);
  for (const [dx, dy, rx, ry] of [
    [0, 9, 20, 6],
    [-2, 1, 15, 5],
    [1, -6, 9, 4],
  ] as const) {
    g.fillEllipse(dx, dy, rx * 2, ry * 2);
  }
  g.fillStyle(0xa87c48, 1);
  g.fillEllipse(-6, -7, 10, 5);
  pile.add(g);
  return pile;
}

/**
 * The puddle.
 *
 * Drawn on demand rather than baked into a room, because it appears in
 * whichever room she was standing in and has to be tappable. Deliberately
 * unpleasant to look at and completely harmless to look away from: it is a
 * shape on the floor, not a stain on the cat.
 */
export function buildPuddle(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const puddle = scene.add.container(x, y);
  const g = scene.add.graphics();

  /*
   * ONE wobbly outline, not three stacked ellipses.
   *
   * The first version overlapped three ovals and stroked the largest, which
   * put a clean elliptical edge around the whole thing — it read as a gold
   * plate lying on the floor. What makes a spill a spill is that its edge
   * disagrees with itself, so the radius is modulated by two out-of-phase
   * waves and the stroke follows every bump.
   */
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 44; i++) {
    const a = (Math.PI * 2 * i) / 44;
    const wobble = 1 + 0.16 * Math.sin(a * 3 + 0.7) + 0.09 * Math.sin(a * 5 - 1.9);
    points.push(new Phaser.Math.Vector2(Math.cos(a) * 46 * wobble, Math.sin(a) * 19 * wobble));
  }
  g.lineStyle(5, 0xa8842a, 1);
  g.strokePoints(points, true);
  g.fillStyle(0xd9b64e, 1);
  g.fillPoints(points, true);
  // A second, brighter pool inside — a spill is deeper in the middle.
  g.fillStyle(0xe8c95f, 1);
  g.fillPoints(
    points.map((p) => new Phaser.Math.Vector2(p.x * 0.72 - 2, p.y * 0.66 - 1)),
    true,
  );
  // And a highlight, so it reads as wet rather than as a stain.
  g.fillStyle(0xf6e79a, 0.95);
  g.fillEllipse(-13, -5, 22, 7);
  puddle.add(g);
  return puddle;
}

/** Warm wood — the one thing in a lilac room that is not lilac. Shared by the
 * kitchen table and the bed frame, which are the two wooden things she owns. */
const WOOD = 0xd2a074;
const WOOD_SH = 0xa9794f;
const WOOD_HI = 0xecc79d;

/**
 * The back half of the kitchen: everything BEHIND her.
 *
 * The table is not here. It is drawn over her by `buildTableFront`, because a
 * cat sitting at a table has the table in front of her — and that one fact is
 * what turned this room from a cat standing in a kitchen into a cat having a
 * meal. What is left back here is the room she is having it in, plus the chair
 * that explains why she is sitting up higher than she stands.
 */
const buildKitchen: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const cx = geo.width / 2;
  const table = tableGeometry(geo);

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
  // Something on the counter, so it reads as a worktop rather than a skirting
  // board: a pot, a jar and a board. All of it clears the fridge.
  outlined(counter, PALETTE.mint, (g) => {
    g.fillRoundedRect(44, geo.floorY - 88, 62, 40, 10);
    g.strokeRoundedRect(44, geo.floorY - 88, 62, 40, 10);
  });
  counter.fillStyle(PALETTE.prop, 1);
  counter.fillRoundedRect(58, geo.floorY - 98, 34, 12, 6);
  outlined(counter, PALETTE.coral, (g) => {
    g.fillRoundedRect(126, geo.floorY - 78, 30, 30, 8);
    g.strokeRoundedRect(126, geo.floorY - 78, 30, 30, 8);
  });
  room.add(counter);

  /*
   * Her chair.
   *
   * `TABLE_PET_RISE` lifts her 58px so the plate is not already inside the
   * radius at which she opens her mouth — see `tableLayout`. A cat floating 58
   * pixels off the floor needs a reason, and this is it. Wider than her torso
   * (64 rig units, ~61 on screen) so it actually shows past her, and topped out
   * below her ears so it frames her rather than growing out of her head.
   */
  const chair = scene.add.graphics();
  const backTop = table.farY - 150;
  // Two posts first, so the back panel's outline closes over their inner edge.
  for (const dx of [-104, 104]) {
    outlined(chair, WOOD_SH, (g) => {
      g.fillRoundedRect(cx + dx - 12, backTop - 14, 24, table.farY - backTop + 20, 10);
      g.strokeRoundedRect(cx + dx - 12, backTop - 14, 24, table.farY - backTop + 20, 10);
    });
  }
  outlined(chair, WOOD, (g) => {
    g.fillRoundedRect(cx - 100, backTop, 200, table.farY - backTop + 14, 22);
    g.strokeRoundedRect(cx - 100, backTop, 200, table.farY - backTop + 14, 22);
  });
  // Slats. Only the outer two ever show — the middle of the back is behind a
  // cat — but a back with one visible slat each side reads as a chair, and one
  // with none reads as a plank.
  chair.lineStyle(9, WOOD_SH, 1);
  for (const dx of [-74, -38, 38, 74]) {
    chair.lineBetween(cx + dx, backTop + 22, cx + dx, table.farY - 4);
  }
  room.add(chair);

  return room;
};

/**
 * The table, drawn OVER her.
 *
 * Same trick as `buildTubFront`: a front-facing rig cannot be put inside a
 * piece of furniture, so the furniture goes on top.
 */
export function buildTableFront(
  scene: Phaser.Scene,
  geo: RoomGeometry,
): Phaser.GameObjects.Container {
  const layer = scene.add.container(0, 0);
  const t = tableGeometry(geo);

  const wood = scene.add.graphics();

  // Legs first, so the apron's outline closes over their tops.
  for (const x of [t.left + 34, t.right - 34]) {
    outlined(wood, WOOD_SH, (g) => {
      g.fillRoundedRect(x - 13, t.nearY, 26, t.legBottom - t.nearY, 8);
      g.strokeRoundedRect(x - 13, t.nearY, 26, t.legBottom - t.nearY, 8);
    });
  }

  // The top: a slab whose far edge is the occluder and whose near face is the
  // thickness you see because you are looking slightly down at it.
  outlined(wood, WOOD, (g) => {
    g.fillRoundedRect(t.left, t.farY, t.width, t.apronY - t.farY, 16);
    g.strokeRoundedRect(t.left, t.farY, t.width, t.apronY - t.farY, 16);
  });
  // Surface tone, lit from up-left like everything else she owns.
  wood.fillStyle(WOOD_HI, 1);
  wood.fillRoundedRect(t.left + 7, t.farY + 6, t.width - 14, t.nearY - t.farY - 6, 12);
  wood.fillStyle(WOOD, 1);
  wood.fillRoundedRect(t.left + 7, t.farY + 6, t.width - 60, t.nearY - t.farY - 14, 12);
  // The seam where the top meets its edge. Without it the slab is one flat
  // shape and the table has no thickness.
  wood.lineStyle(5, WOOD_SH, 1);
  wood.lineBetween(t.left + 12, t.nearY, t.right - 12, t.nearY);
  layer.add(wood);

  // The place setting. Permanently laid, whether or not she is eating — a
  // table with nothing on it is a bench, and the plate has to be somewhere the
  // player already expects food to land before the first meal is served.
  const setting = scene.add.graphics();
  // Mat.
  setting.fillStyle(PALETTE.inner, 1);
  setting.lineStyle(5, PALETTE.coralLo, 1);
  setting.fillRoundedRect(t.plateX - 106, t.plateY - 28, 212, 56, 16);
  setting.strokeRoundedRect(t.plateX - 106, t.plateY - 28, 212, 56, 16);
  // Cutlery, one each side, drawn before the plate so the plate overlaps them.
  for (const dir of [-1, 1] as const) {
    const x = t.plateX + dir * 84;
    setting.fillStyle(PALETTE.cream, 1);
    setting.lineStyle(4, PALETTE.prop, 1);
    setting.fillRoundedRect(x - 5, t.plateY - 17, 10, 34, 5);
    setting.strokeRoundedRect(x - 5, t.plateY - 17, 10, 34, 5);
    setting.fillEllipse(x, t.plateY - 14, 13, 15);
    setting.strokeEllipse(x, t.plateY - 14, 13, 15);
  }
  // The plate: an ellipse, because the table is seen from slightly above.
  setting.fillStyle(PALETTE.cream, 1);
  setting.lineStyle(6, PALETTE.prop, 1);
  setting.fillEllipse(t.plateX, t.plateY, PLATE_WIDTH, PLATE_HEIGHT);
  setting.strokeEllipse(t.plateX, t.plateY, PLATE_WIDTH, PLATE_HEIGHT);
  setting.lineStyle(4, PALETTE.wallLo, 1);
  setting.strokeEllipse(t.plateX, t.plateY + 1, PLATE_WIDTH - 28, PLATE_HEIGHT - 14);
  layer.add(setting);

  /*
   * The rest of the setting, out past the mat.
   *
   * A laid table is the point of the room — one plate on a bare slab reads as
   * a workbench with a saucer on it. These sit outside the mat on purpose: the
   * plate is where food actually lands, and anything crowding it would compete
   * with the one object the player has to aim at.
   */
  const extras = scene.add.graphics();
  const glassX = t.plateX - 148;
  if (glassX - 22 > t.left + 16) {
    // Milk, in a glass, with the level drawn as a separate face so it reads as
    // liquid inside rather than as a tinted tumbler.
    outlined(extras, PALETTE.white, (g) => {
      g.fillRoundedRect(glassX - 21, t.plateY - 46, 42, 62, { tl: 6, tr: 6, bl: 14, br: 14 });
      g.strokeRoundedRect(glassX - 21, t.plateY - 46, 42, 62, { tl: 6, tr: 6, bl: 14, br: 14 });
    });
    extras.fillStyle(0xeaf4ff, 1);
    extras.fillRoundedRect(glassX - 15, t.plateY - 28, 30, 38, { tl: 3, tr: 3, bl: 10, br: 10 });
    extras.fillStyle(PALETTE.white, 1);
    extras.fillEllipse(glassX, t.plateY - 28, 30, 11);
  }
  const bowlX = t.plateX + 148;
  if (bowlX + 30 < t.right - 16) {
    // A side bowl of something. Two arcs and three lumps at this size; any
    // more detail turns to mud next to the plate.
    outlined(extras, PALETTE.sky, (g) => {
      g.fillEllipse(bowlX, t.plateY - 6, 76, 34);
      g.strokeEllipse(bowlX, t.plateY - 6, 76, 34);
    });
    extras.fillStyle(PALETTE.butter, 1);
    for (const [dx, dy] of [
      [-14, -10],
      [4, -14],
      [16, -8],
    ] as const) {
      extras.fillCircle(bowlX + dx, t.plateY + dy, 8);
    }
    outlined(extras, PALETTE.blue, (g) => {
      g.fillEllipse(bowlX, t.plateY + 2, 80, 26);
      g.strokeEllipse(bowlX, t.plateY + 2, 80, 26);
    });
  }
  layer.add(extras);

  bakeStatic(scene, layer, geo.width, geo.height);
  return layer;
}

/* --------------------------- the bathroom -------------------------- */

/**
 * The seat board's own white — cooler than the pan's cream.
 *
 * Not decoration. With one tone for both, the board and the pan were a single
 * continuous shape and she read as standing in a pot. A seat is a separate
 * object bolted onto a different one, and two tones is the cheapest way to
 * say so.
 */
const SEAT_BOARD = 0xf0eaf9;

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

/* --------------------------- the lavatory -------------------------- */

/**
 * The back half of the lavatory: everything BEHIND her.
 *
 * The near face of the pan and the front of the seat are drawn over her by
 * `buildLooFront` — see `looLayout` for why that one line is the entire design.
 *
 * DIGNITY, AS GEOMETRY RATHER THAN AS A PROMISE. The bowl's interior is one
 * flat tone and nothing else: no water line, no ripple, no shape a child could
 * resolve into a thing. All the player ever sees of the inside is two
 * lens-shaped crescents about 23x11px beside her waist, so there must be
 * nothing in them — and the simplest way to guarantee that is to draw nothing
 * in them at all. There is no brown anywhere in this room. The propping does
 * the talking: a roll on the wall, a flush plate, and an extractor fan that
 * actually turns, which is the polite half of the idea and the only half worth
 * animating.
 */
const buildLoo: RoomBuilder = (scene, geo) => {
  const room = scene.add.container(0, 0);
  const loo = looGeometry(geo);
  const { centreX: cx, seatCY, seatRx, seatRy, holeRx, holeRy, backRx, groundY } = loo;

  /*
   * Tongue-and-groove wainscot, NOT the bathroom's tile grid.
   *
   * Both rooms are white fixtures on lilac and the wall is the only thing that
   * tells them apart at a glance. A square grid reads as a big wet room;
   * vertical grooves read as a narrow one, which is what this is. Grooves are
   * 4px at a 32px pitch — thinner and they turn to mud, closer and they moire.
   */
  const wall = scene.add.graphics();
  wall.fillStyle(PALETTE.wallHi, 1);
  wall.fillRect(0, loo.railY, geo.width, geo.floorY - loo.railY);
  wall.lineStyle(4, PALETTE.wallLo, 0.45);
  for (let x = 18; x < geo.width; x += 32) {
    wall.lineBetween(x, loo.railY + 12, x, geo.floorY - 14);
  }
  // A cap and a foot. Panelling with neither is just a paler rectangle.
  wall.fillStyle(PALETTE.wallLo, 1);
  wall.fillRoundedRect(-8, loo.railY - 9, geo.width + 16, 18, 7);
  wall.fillRect(0, geo.floorY - 14, geo.width, 14);
  room.add(wall);

  /*
   * Extractor fan, high on the LEFT.
   *
   * It was specified on the right at (width - 76, 250) and that lands directly
   * under the tasks/shop/ad rail — on a phone the room column and the UI column
   * are the same width, so `width - 76` IS where those buttons are, and the
   * blades spun behind the rewarded-video button. The right side below the rail
   * also belongs to her tail. The left wall above the roll is the one place
   * nothing else wants.
   */
  const fanX = 84;
  const fanY = 214;
  const vent = scene.add.graphics();
  outlined(vent, PORCELAIN, (g) => {
    g.fillCircle(fanX, fanY, 38);
    g.strokeCircle(fanX, fanY, 38);
  });
  vent.fillStyle(PORCELAIN_SH, 1);
  vent.fillCircle(fanX, fanY, 30);
  room.add(vent);

  const blades = scene.add.graphics();
  blades.fillStyle(PALETTE.prop, 1);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    blades.fillTriangle(
      0,
      0,
      Math.cos(a) * 28,
      Math.sin(a) * 28,
      Math.cos(a + 0.9) * 27,
      Math.sin(a + 0.9) * 27,
    );
  }
  blades.fillStyle(0xdfe6f2, 1);
  blades.fillCircle(0, 0, 8);
  blades.setPosition(fanX, fanY);
  room.add(markAnimated(blades));
  scene.tweens.add({ targets: blades, angle: 360, duration: 7200, repeat: -1, ease: 'Linear' });

  /*
   * The roll, on the LEFT wall on purpose: her tail sweeps out to about
   * cx+152 between y 400 and 460, and the right side below the rail is its.
   */
  const rollX = 70;
  const rollY = geo.floorY - 92;
  const holder = scene.add.graphics();
  outlined(holder, 0xdfe6f2, (g) => {
    g.fillRoundedRect(16, rollY - 27, 20, 54, 8);
    g.strokeRoundedRect(16, rollY - 27, 20, 54, 8);
    g.fillRoundedRect(30, rollY - 9, 46, 18, 9);
    g.strokeRoundedRect(30, rollY - 9, 46, 18, 9);
  });
  room.add(holder);

  const roll = scene.add.graphics();
  outlined(roll, PALETTE.white, (g) => {
    g.fillCircle(rollX, rollY, 30);
    g.strokeCircle(rollX, rollY, 30);
  });
  roll.fillStyle(PORCELAIN_SH, 1);
  roll.fillCircle(rollX, rollY, 11);
  roll.lineStyle(5, PALETTE.prop, 1);
  roll.strokeCircle(rollX, rollY, 11);
  room.add(roll);

  /*
   * The hanging sheet sways. Drawn from its own top edge and positioned at the
   * spindle, so the tween hangs it rather than spinning it about its middle.
   */
  const sheet = scene.add.graphics();
  const hem: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    hem.push(v(24 - 48 * t, 58 + Math.sin(t * Math.PI * 2) * 4));
  }
  const leaf = [v(-24, 0), v(24, 0), ...hem];
  sheet.fillStyle(PALETTE.white, 1);
  sheet.fillPoints(leaf, true);
  sheet.lineStyle(6, PALETTE.prop, 1);
  sheet.strokePoints(leaf, true);
  sheet.setPosition(rollX, rollY + 4);
  room.add(markAnimated(sheet));
  scene.tweens.add({
    targets: sheet,
    angle: { from: -2.5, to: 2.5 },
    duration: 2800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Mint, so the room is not a third blue bathroom.
  const mat = scene.add.graphics();
  mat.fillStyle(PALETTE.mint, 1);
  mat.fillEllipse(cx, geo.height - 36, 320, 66);
  mat.lineStyle(9, PALETTE.mintLo, 1);
  mat.strokeEllipse(cx, geo.height - 36, 296, 44);
  room.add(mat);

  /*
   * A step. The seat's top surface is 190px above the floor line and she is
   * 336px tall, so "how did she get up there" is a question the picture has to
   * answer. Only where the column is honestly wide enough — on a phone it
   * lands half off the room and under the side buttons, the same call the
   * bedside table makes.
   */
  if (geo.width >= 620) {
    const step = scene.add.graphics();
    outlined(step, 0xc09a6d, (g) => {
      for (const x of [cx - 234, cx - 138]) {
        g.fillRoundedRect(x, groundY - 44, 18, 44, { tl: 0, tr: 0, bl: 7, br: 7 });
        g.strokeRoundedRect(x, groundY - 44, 18, 44, { tl: 0, tr: 0, bl: 7, br: 7 });
      }
    });
    outlined(step, 0xe0be93, (g) => {
      g.fillRoundedRect(cx - 244, groundY - 62, 120, 22, 9);
      g.strokeRoundedRect(cx - 244, groundY - 62, 120, 22, 9);
    });
    room.add(step);
  }

  /*
   * The BACK of the pan, one tone down. Drawn twice like the tub: this shell
   * is behind her, the near face is on top of her. The band of shadow tone
   * that shows either side of the near face is the whole reason the fixture
   * reads as a solid object rather than a white shape cut out of the wall.
   */
  const back = scene.add.graphics();
  outlined(back, PORCELAIN_SH, (g) => {
    const right = curve(v(cx + backRx, seatCY), v(cx + backRx - 4, groundY - 66), v(cx + 76, groundY), 14);
    const left = curve(v(cx - backRx, seatCY), v(cx - backRx + 4, groundY - 66), v(cx - 76, groundY), 14);
    const shell = [
      v(cx - backRx, seatCY),
      v(cx + backRx, seatCY),
      ...right.slice(1),
      ...[...left].reverse().slice(1),
    ];
    g.fillPoints(shell, true);
    g.strokePoints(shell, true);
  });
  room.add(back);

  /*
   * The cistern: LOW and WIDE, not tall.
   *
   * A tall one sits behind her head, and her head is 180px across — all that
   * would show is two 20px shoulders, which is mud. Dropped to her chest it is
   * competing with a 123px torso instead and 57px of it shows either side.
   */
  const cistern = scene.add.graphics();
  outlined(cistern, PORCELAIN, (g) => {
    g.fillRoundedRect(cx - 124, loo.cisternTop, 248, seatCY - loo.cisternTop, {
      tl: 10, tr: 10, bl: 16, br: 16,
    });
    g.strokeRoundedRect(cx - 124, loo.cisternTop, 248, seatCY - loo.cisternTop, {
      tl: 10, tr: 10, bl: 16, br: 16,
    });
    g.fillRoundedRect(cx - 134, loo.lidTop, 268, 20, 8);
    g.strokeRoundedRect(cx - 134, loo.lidTop, 268, 20, 8);
  });
  cistern.fillStyle(PALETTE.white, 1);
  cistern.fillRoundedRect(cx - 126, loo.lidTop + 4, 252, 8, 4);
  /*
   * The flush, on the lid and LEFT of centre. Not centred — that is behind her
   * head. Not on a side face — the right is where her tail lands and the left
   * is under the roll's hanging sheet on a phone.
   */
  outlined(cistern, 0xdfe6f2, (g) => {
    g.fillEllipse(cx - 92, loo.lidTop + 10, 46, 20);
    g.strokeEllipse(cx - 92, loo.lidTop + 10, 46, 20);
  });
  cistern.fillStyle(PALETTE.white, 0.9);
  cistern.fillEllipse(cx - 92, loo.lidTop + 7, 26, 9);
  room.add(cistern);

  /*
   * The seat, as four quadratics rather than an ellipse.
   *
   * `fillEllipse` here and a quadratic crescent in the front layer do not
   * agree: a quadratic runs a few px INSIDE a true ellipse near its ends, so
   * the back half's outline showed down both sides as a sliver the crescent
   * could not cover. Same curve family in both layers, no sliver.
   */
  const seatFar = curve(v(cx - seatRx, seatCY), v(cx, seatCY - seatRy * 2), v(cx + seatRx, seatCY), 26);
  const seatNear = curve(v(cx + seatRx, seatCY), v(cx, seatCY + seatRy * 2), v(cx - seatRx, seatCY), 26);
  const holeFar = curve(v(cx - holeRx, seatCY), v(cx, seatCY - holeRy * 2), v(cx + holeRx, seatCY), 18);
  const holeNear = curve(v(cx + holeRx, seatCY), v(cx, seatCY + holeRy * 2), v(cx - holeRx, seatCY), 18);

  /*
   * The board is a DIFFERENT WHITE from the pan.
   *
   * It was the same cream as the pan, and the two merged into one continuous
   * shape — she read as a cat standing inside a pot rather than sitting on a
   * seat, which is the one thing this room has to communicate. A real seat is
   * a separate object made of a different material, so it gets a cooler tone,
   * and the shadow it casts (in the front layer) got heavier to match.
   */
  /*
   * The pan's near face, BEHIND her now rather than over her. Its top edge IS
   * `holeNear`, the same curve the hole is cut with, so no gap can open
   * between the bowl and the board at any column.
   */
  const flank = (dir: -1 | 1): Phaser.Math.Vector2[] => [
    ...curve(
      v(cx + dir * loo.panRx, seatCY),
      v(cx + dir * (loo.panRx + 2), groundY - 92),
      v(cx + dir * 58, groundY - 48),
      14,
    ),
    ...curve(
      v(cx + dir * 58, groundY - 48),
      v(cx + dir * 50, groundY - 24),
      v(cx + dir * 60, groundY),
      10,
    ).slice(1),
  ];
  const pan = scene.add.graphics();
  outlined(pan, PORCELAIN, (g) => {
    const bowl = [
      v(cx - loo.panRx, seatCY),
      ...[...holeNear].reverse(),
      v(cx + loo.panRx, seatCY),
      ...flank(1).slice(1),
      ...[...flank(-1)].reverse().slice(1),
    ];
    g.fillPoints(bowl, true);
    g.strokePoints(bowl, true);
  });
  // The shadow the board casts on it, or the two read as one slab of cream.
  const castLip = curve(v(cx - 90, seatCY + 8), v(cx, seatCY + 76), v(cx + 90, seatCY + 8), 18);
  pan.fillStyle(PORCELAIN_SH, 0.75);
  pan.fillPoints([...castLip, ...[...castLip].reverse().map((p) => v(p.x, p.y + 22))], true);
  pan.fillStyle(PALETTE.white, 0.7);
  pan.fillRoundedRect(cx - 34, groundY - 100, 24, 76, 12);
  room.add(pan);

  const foot = scene.add.graphics();
  outlined(foot, PORCELAIN_SH, (g) => {
    g.fillRoundedRect(cx - 86, groundY - 32, 172, 32, { tl: 10, tr: 10, bl: 14, br: 14 });
    g.strokeRoundedRect(cx - 86, groundY - 32, 172, 32, { tl: 10, tr: 10, bl: 14, br: 14 });
  });
  room.add(foot);

  const seat = scene.add.graphics();
  seat.fillStyle(SEAT_BOARD, 1);
  seat.fillPoints([...seatFar, ...seatNear], true);
  seat.lineStyle(6, PALETTE.prop, 1);
  seat.strokePoints(seatFar, false);
  seat.fillStyle(PORCELAIN_SH, 1);
  seat.fillPoints([...holeFar, ...holeNear], true);
  seat.lineStyle(5, PALETTE.prop, 1);
  seat.strokePoints(holeFar, false);
  room.add(seat);

  return room;
};

/**
 * The near face of the pan and the front of the seat, drawn OVER her.
 *
 * Same trick as the tub's near wall and the duvet, and here it is not a nicety
 * — it is the entire design. See `looLayout`. What it hides at
 * `LOO_PET_RISE`: both legs, both feet, the bottom 17px of the torso and the
 * whole near half of the bowl. `tests/lavatory.test.ts` walks the lip against
 * her column by column so no leg pixel can escape at any screen width.
 */
export function buildLooFront(scene: Phaser.Scene, geo: RoomGeometry): Phaser.GameObjects.Container {
  const layer = scene.add.container(0, 0);
  const loo = looGeometry(geo);
  const { centreX: cx, seatCY, seatRx, seatRy, holeRx, holeRy } = loo;

  /*
   * ONLY the board's front crescent goes over her. The pan does not.
   *
   * It used to — the whole near face of the bowl was drawn on top of her, and
   * that is what hid her legs. It is also what made her read as a cat standing
   * INSIDE a bucket rather than sitting on a lavatory, which the owner said in
   * four words and was right about. With the legs simply not drawn (see
   * `LOO_PET_RISE`) there is nothing down there left to hide, so the pan moved
   * behind her where it belongs and all that crosses her now is the 24px front
   * edge of the seat, at her hips. That one band is the difference between ON
   * and IN.
   */
  const seatNear = curve(v(cx + seatRx, seatCY), v(cx, seatCY + seatRy * 2), v(cx - seatRx, seatCY), 26);
  const holeNear = curve(v(cx + holeRx, seatCY), v(cx, seatCY + holeRy * 2), v(cx - holeRx, seatCY), 18);

  /*
   * Only the two ARCS are stroked, never the closing segments at x = ±seatRx.
   * Closing the outline draws a 32px tick across the board at each side,
   * exactly where this half meets the half behind her, and a seam there reads
   * as a crack in the seat.
   */
  const crescent = [...seatNear, ...[...holeNear].reverse()];
  const seat = scene.add.graphics();
  seat.fillStyle(SEAT_BOARD, 1);
  seat.fillPoints(crescent, true);
  seat.lineStyle(6, PALETTE.prop, 1);
  seat.strokePoints(seatNear, false);
  seat.strokePoints(holeNear, false);
  // A soft top light along the board, so the front lip has a roll to it.
  seat.lineStyle(7, PALETTE.white, 0.85);
  seat.strokePoints(
    curve(v(cx - 92, seatCY + 6), v(cx, seatCY + 52), v(cx + 92, seatCY + 6), 20),
    false,
  );
  layer.add(seat);

  bakeStatic(scene, layer, geo.width, geo.height);
  return layer;
}

const BUILDERS: Readonly<Record<Exclude<RoomKey, 'play'>, RoomBuilder>> = {
  home: buildHome,
  kitchen: buildKitchen,
  bath: buildBath,
  bed: buildBed,
  loo: buildLoo,
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

/**
 * Vector icons drawn with Phaser Graphics — the same set the prototype's SVG
 * sprite carries, redrawn as strokes so they stay crisp at any scale and add
 * nothing to the download.
 *
 * Every icon is authored inside a 24x24 box centred on its own origin, so a
 * caller only has to position and scale.
 */

import Phaser from 'phaser';

import { bakeArt } from '@/ui/bake';

export type IconName =
  | 'home'
  | 'food'
  | 'bath'
  | 'moon'
  | 'game'
  | 'hat'
  | 'tv'
  | 'meat'
  | 'bolt'
  | 'star'
  | 'drop'
  | 'mic'
  | 'hand'
  | 'soap'
  | 'brush'
  | 'tooth'
  | 'shower'
  | 'sun'
  | 'coin'
  | 'gem'
  | 'fish'
  | 'milk'
  | 'steak'
  | 'cake'
  | 'sushi'
  | 'feast'
  | 'sock'
  | 'gear'
  | 'soundOn'
  | 'soundOff'
  | 'music'
  | 'musicOff'
  | 'restore';

type Draw = (g: Phaser.GameObjects.Graphics) => void;

/** Stroke helper: polyline through the given 24x24-space points, recentred. */
function line(g: Phaser.GameObjects.Graphics, pts: readonly [number, number][], close = false): void {
  if (pts.length < 2) return;
  g.beginPath();
  const [first, ...rest] = pts as [[number, number], ...[number, number][]];
  g.moveTo(first[0] - 12, first[1] - 12);
  for (const [x, y] of rest) g.lineTo(x - 12, y - 12);
  if (close) g.closePath();
  g.strokePath();
}

const ICONS: Readonly<Record<IconName, Draw>> = {
  home: (g) => {
    line(g, [
      [3, 11.2],
      [12, 3.4],
      [21, 11.2],
      [21, 21],
      [14.8, 21],
      [14.8, 15.6],
      [9.2, 15.6],
      [9.2, 21],
      [3, 21],
    ], true);
  },
  food: (g) => {
    g.beginPath();
    g.arc(0, -0.6, 9.4, 0, Math.PI, false);
    g.strokePath();
    line(g, [[2.6, 11.4], [21.4, 11.4]]);
    line(g, [[8, 8.4], [8, 5.6], [9.6, 4.8]]);
    line(g, [[12, 7.8], [12, 5.2], [13.8, 3.8]]);
    line(g, [[16, 8.4], [16, 5.6], [17.6, 4.8]]);
  },
  bath: (g) => {
    line(g, [[12, 2.6], [5.6, 11], [5.6, 14]]);
    g.beginPath();
    g.arc(0, 2, 6.4, 0, Math.PI, false);
    g.strokePath();
    line(g, [[18.4, 14], [18.4, 11], [12, 2.6]]);
  },
  moon: (g) => {
    g.beginPath();
    g.arc(0, 0.6, 8.6, Phaser.Math.DegToRad(35), Phaser.Math.DegToRad(275), false);
    g.strokePath();
    line(g, [[-1.4, -8.4], [3.6, -4.4]]);
  },
  game: (g) => {
    g.strokeRoundedRect(-9.6, -3.6, 19.2, 11.2, 5.2);
    line(g, [[7.4, 11], [7.4, 14.4]]);
    line(g, [[5.7, 12.7], [9.1, 12.7]]);
    g.fillCircle(3.6, -0.6, 1.2);
    g.fillCircle(6, 2.4, 1.2);
  },
  hat: (g) => {
    g.strokeRect(-8.6, 5.6, 17.2, 3.2);
    line(g, [[6.8, 17.6], [6.8, 11.6]]);
    g.beginPath();
    g.arc(0, -0.4, 5.2, Math.PI, 0, false);
    g.strokePath();
    line(g, [[17.2, 17.6], [17.2, 11.6]]);
    line(g, [[6.8, 13.6], [17.2, 13.6]]);
  },
  tv: (g) => {
    g.strokeRoundedRect(-9.4, -5.4, 18.8, 13.4, 3);
    line(g, [[8, 6.6], [5, 2.8]]);
    line(g, [[16, 6.6], [19, 2.8]]);
    g.fillTriangle(-1.4, -0.6, -1.4, 4.2, 3, 1.8);
  },
  meat: (g) => {
    g.beginPath();
    g.arc(2.4, -2.4, 7.2, 0, Math.PI * 2, false);
    g.strokePath();
    line(g, [[9.6, 20], [3.8, 14.2]]);
    g.strokeCircle(-6, 6, 4.2);
  },
  bolt: (g) => {
    line(g, [
      [13.6, 2.4],
      [5.2, 13.4],
      [10.6, 13.4],
      [9.8, 21.6],
      [18.4, 10.6],
      [12.8, 10.6],
    ], true);
  },
  star: (g) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 9.6 : 4.2;
      const a = Phaser.Math.DegToRad(-90 + i * 36);
      pts.push([12 + Math.cos(a) * r, 12 + Math.sin(a) * r]);
    }
    line(g, pts, true);
  },
  drop: (g) => {
    g.strokeCircle(-3, -2, 5.4);
    g.strokeCircle(4.4, 4, 4);
  },
  mic: (g) => {
    g.strokeRoundedRect(-3, -9.6, 6, 11.4, 3);
    g.beginPath();
    g.arc(0, -0.6, 6.6, 0, Math.PI, false);
    g.strokePath();
    line(g, [[12, 18], [12, 21.4]]);
  },
  hand: (g) => {
    line(g, [[8.4, 11], [8.4, 4.6]]);
    line(g, [[12, 10], [12, 3.6]]);
    line(g, [[15.6, 10], [15.6, 5.6]]);
    g.beginPath();
    g.arc(0, 3, 7.4, Phaser.Math.DegToRad(-20), Phaser.Math.DegToRad(200), false);
    g.strokePath();
  },
  soap: (g) => {
    g.strokeRoundedRect(-9, -2.4, 18, 10.8, 4);
    g.beginPath();
    g.arc(0, -2.4, 4.8, Math.PI, 0, false);
    g.strokePath();
    g.strokeCircle(4.6, -7.6, 1.6);
  },
  /** Scrubbing brush: block, handle, four bristles. */
  brush: (g) => {
    g.strokeRoundedRect(-9.4, -3.4, 18.8, 7.6, 3);
    line(g, [[9, 8.6], [9, 4.4]]);
    line(g, [[9, 8.6], [15, 8.6]]);
    for (const x of [-6.4, -2.2, 2, 6.2]) line(g, [[x + 12, 15.6], [x + 12, 20]]);
  },
  /** Toothbrush: head, three bristles, handle. */
  tooth: (g) => {
    g.strokeRoundedRect(-10.6, -3.2, 8.6, 7, 2.6);
    line(g, [[1.4, 12], [21, 12]]);
    for (const y of [-1, 1.6]) line(g, [[1.4, y + 12], [21, y + 12]]);
    for (const x of [-8.8, -6.2, -3.6]) line(g, [[x + 12, 15.4], [x + 12, 19.4]]);
  },
  /** Shower head on its arm, with the water coming out. */
  shower: (g) => {
    line(g, [[19.4, 2.6], [19.4, 7], [12, 7]]);
    g.strokeRoundedRect(-10.6, -5, 13.4, 5.4, 2.4);
    for (const x of [-7.4, -4, -0.6]) line(g, [[x + 12, 14.6], [x + 12, 17.2]]);
    for (const x of [-5.8, -2.2]) line(g, [[x + 12, 19], [x + 12, 21]]);
  },
  sun: (g) => {
    g.strokeCircle(0, 0, 4.6);
    for (let i = 0; i < 8; i++) {
      const a = Phaser.Math.DegToRad(i * 45);
      line(g, [
        [12 + Math.cos(a) * 7, 12 + Math.sin(a) * 7],
        [12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10],
      ]);
    }
  },
  coin: (g) => {
    g.fillCircle(0, 0, 9);
    g.fillStyle(0xe8b23c, 1);
    g.fillCircle(0, 0, 5);
  },
  gem: (g) => {
    g.fillTriangle(0, -9.6, 9, -3, 0, 9.6);
    g.fillTriangle(0, -9.6, -9, -3, 0, 9.6);
  },
  fish: (g) => {
    g.fillStyle(0xff9a5b, 1);
    g.fillEllipse(-1, 0, 22, 19);
    g.fillStyle(0xff7a3c, 1);
    g.fillTriangle(9, 0, 16, -8, 16, 8);
    g.fillStyle(0x33243f, 1);
    g.fillCircle(-6, -2.6, 2.2);
  },
  milk: (g) => {
    g.fillStyle(0xeaf6fb, 1);
    g.fillRect(-8, -5, 16, 15);
    g.fillStyle(0xcfeaf5, 1);
    g.fillTriangle(-8, -5, 0, -14, 8, -5);
    g.fillStyle(0x6ec5e9, 1);
    g.fillRect(-4, 1, 8, 7);
  },
  steak: (g) => {
    g.fillStyle(0xf0836f, 1);
    g.fillEllipse(1, 0, 26, 25);
    g.fillStyle(0xfff7ec, 1);
    g.fillTriangle(-12, 6, -8, 3, -8, 10);
  },
  sushi: (g) => {
    // Nori band, rice, then one salmon slice on top. Read outside-in so each
    // fill covers the one under it and there is no seam to line up.
    g.fillStyle(0x2f4a3a, 1);
    g.fillRoundedRect(-11, -6, 22, 18, 4);
    g.fillStyle(0xfdf6ef, 1);
    g.fillRoundedRect(-8.5, -4, 17, 15, 3);
    g.fillStyle(0xff8a5b, 1);
    g.fillEllipse(0, -7, 24, 10);
    g.fillStyle(0xffb08c, 1);
    g.fillEllipse(-3, -8.5, 11, 4);
  },
  feast: (g) => {
    // A domed cloche. One shape and a handle — anything more turns to mush at
    // 24px, which is the size this is actually drawn at.
    g.fillStyle(0xdfe6f2, 1);
    g.beginPath();
    g.arc(0, 5, 13, Math.PI, 0, false);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xc3cede, 1);
    g.fillRoundedRect(-15, 4, 30, 5, 2.5);
    g.fillStyle(0xffd46b, 1);
    g.fillCircle(0, -10, 3.2);
  },
  cake: (g) => {
    g.fillStyle(0xffd9e4, 1);
    g.fillRoundedRect(-13, 1, 26, 13, 3);
    g.fillStyle(0xfff7ec, 1);
    g.fillRect(-1.6, -10, 3.2, 9);
    g.fillStyle(0xffc94d, 1);
    g.fillCircle(0, -12, 2.4);
  },
  gear: (g) => {
    g.strokeCircle(0, 0, 4.4);
    for (let i = 0; i < 8; i++) {
      const a = Phaser.Math.DegToRad(i * 45);
      line(g, [
        [12 + Math.cos(a) * 7.2, 12 + Math.sin(a) * 7.2],
        [12 + Math.cos(a) * 10.4, 12 + Math.sin(a) * 10.4],
      ]);
    }
    g.strokeCircle(0, 0, 7.6);
  },
  soundOn: (g) => {
    // Speaker cone, then two arcs for the sound waves.
    line(g, [[3, 9], [7.4, 9], [12.4, 4.4], [12.4, 19.6], [7.4, 15], [3, 15]], true);
    for (const r of [4.6, 8]) {
      g.beginPath();
      g.arc(2.4, 0, r, Phaser.Math.DegToRad(-55), Phaser.Math.DegToRad(55), false);
      g.strokePath();
    }
  },
  soundOff: (g) => {
    line(g, [[3, 9], [7.4, 9], [12.4, 4.4], [12.4, 19.6], [7.4, 15], [3, 15]], true);
    // A plain cross reads as "off" at 24px far better than a struck-through arc.
    line(g, [[16, 9], [21.4, 15]]);
    line(g, [[21.4, 9], [16, 15]]);
  },
  music: (g) => {
    // A beamed pair of quavers: two stems joined at the top, filled heads below.
    line(g, [[9.6, 17], [9.6, 4.6], [19.4, 2.6], [19.4, 15]]);
    line(g, [[9.6, 8.2], [19.4, 6.2]]);
    g.fillCircle(9.6 - 12 - 2.6, 17 - 12 + 0.6, 3.1);
    g.fillCircle(19.4 - 12 - 2.6, 15 - 12 + 0.6, 3.1);
  },
  musicOff: (g) => {
    // Single note plus a cross — the same "off" language as soundOff.
    line(g, [[8.6, 16.6], [8.6, 3.8], [14.6, 2.4]]);
    g.fillCircle(8.6 - 12 - 2.5, 16.6 - 12 + 0.6, 3);
    line(g, [[16.4, 10], [21.6, 16]]);
    line(g, [[21.6, 10], [16.4, 16]]);
  },
  restore: (g) => {
    g.beginPath();
    g.arc(0, 0, 8.2, Phaser.Math.DegToRad(60), Phaser.Math.DegToRad(340), false);
    g.strokePath();
    line(g, [[16.6, 1.4], [16.2, 7.4], [10.6, 6]]);
  },
  sock: (g) => {
    g.fillStyle(0xb7a6e0, 1);
    g.fillRect(-6, -14, 11, 15);
    g.fillTriangle(-6, 1, 5, 1, 9, 12);
    g.fillCircle(6, 10, 6);
  },
};

/**
 * Draw `name` as a baked, cached texture sized so a 24x24 icon becomes `size`
 * px wide, centred on its origin.
 *
 * Identical (name, size, colour) requests share one texture, so the five nav
 * tabs and every fish in the mini-game cost one upload between them rather
 * than one re-tessellation each, every frame.
 */
export function drawIcon(
  scene: Phaser.Scene,
  name: IconName,
  size: number,
  color: number,
  strokeWidth = 2.1,
): Phaser.GameObjects.Image {
  const scale = size / 24;
  // The 24x24 box plus room for strokes that sit proud of the edge.
  const pad = 3;
  const half = 12 + pad;
  const key = `icon:${name}:${size.toFixed(2)}:${color}:${strokeWidth}`;

  return bakeArt(
    scene,
    key,
    { left: -half * scale, top: -half * scale, right: half * scale, bottom: half * scale },
    (g) => {
      g.setScale(g.scaleX * scale);
      g.lineStyle(strokeWidth, color, 1);
      g.fillStyle(color, 1);
      ICONS[name](g);
    },
  );
}

/**
 * The canvas-sizing rule.
 *
 * These numbers decide whether the game fills a desktop screen or sits in a
 * strip down the middle of it, and whether a phone gets exactly the layout it
 * has always had. Both are easy to break by "tidying" the clamp.
 */

import { describe, expect, it } from 'vitest';

import { DESIGN, designSizeFor, uiColumn } from '@/ui/theme';

describe('designSizeFor', () => {
  it('leaves a portrait phone exactly as it was', () => {
    for (const [w, h] of [
      [390, 844],
      [360, 800],
      [430, 932],
      [412, 915],
    ] as const) {
      expect(designSizeFor(w, h)).toEqual({ width: DESIGN.width, height: DESIGN.height });
    }
  });

  it('widens to the window aspect on a landscape screen', () => {
    const { width, height } = designSizeFor(1920, 1080);
    expect(height).toBe(DESIGN.height);
    expect(width).toBe(Math.round(DESIGN.height * (1920 / 1080)));
    expect(width).toBeGreaterThan(DESIGN.width * 3);
  });

  it('covers a full 16:9 display without hitting the cap', () => {
    // The commonest desktop shape. If the cap sits below what 16:9 asks for,
    // the one screen that matters most is the one that does not fill.
    const sixteenNine = Math.round(DESIGN.height * (16 / 9));
    expect(DESIGN.maxWidth).toBeGreaterThanOrEqual(sixteenNine);
    expect(designSizeFor(1920, 1080).width).toBe(sixteenNine);
  });

  it('caps, so the pet never floats in an ocean of floor', () => {
    // An ultrawide 32:9 would ask for 3057.
    expect(designSizeFor(5120, 1440).width).toBe(DESIGN.maxWidth);
  });

  it('never returns less than the portrait design', () => {
    expect(designSizeFor(200, 2000).width).toBe(DESIGN.width);
  });

  it('survives a zero or negative window rather than dividing by it', () => {
    // Browsers report 0x0 for a hidden iframe, and a NaN canvas size is fatal.
    for (const [w, h] of [
      [0, 0],
      [0, 800],
      [800, 0],
      [-100, 100],
    ] as const) {
      const size = designSizeFor(w, h);
      expect(Number.isFinite(size.width)).toBe(true);
      expect(size).toEqual({ width: DESIGN.width, height: DESIGN.height });
    }
  });

  it('always fills the height, so FIT is limited by width and never letterboxes', () => {
    expect(designSizeFor(1920, 1080).height).toBe(DESIGN.height);
    expect(designSizeFor(390, 844).height).toBe(DESIGN.height);
  });
});

describe('uiColumn', () => {
  it('is the whole canvas on a phone', () => {
    expect(uiColumn(DESIGN.width)).toEqual({ left: 0, width: DESIGN.width });
  });

  it('centres and caps on a wide canvas', () => {
    const column = uiColumn(1500);
    expect(column.width).toBe(DESIGN.uiMaxWidth);
    expect(column.left).toBe((1500 - DESIGN.uiMaxWidth) / 2);
    // Symmetric: the right gap must equal the left one.
    expect(1500 - column.left - column.width).toBe(column.left);
  });

  it('never exceeds the canvas it is placed in', () => {
    for (const canvas of [320, 420, 600, 601, 900, DESIGN.maxWidth]) {
      const column = uiColumn(canvas);
      expect(column.width).toBeLessThanOrEqual(canvas);
      expect(column.left).toBeGreaterThanOrEqual(0);
      expect(column.left + column.width).toBeLessThanOrEqual(canvas);
    }
  });

  it('keeps the controls reachable rather than pinned to the far edges', () => {
    // The whole point: on the widest canvas the controls stay in the middle
    // 40%, not spread across a metre of screen.
    const column = uiColumn(DESIGN.maxWidth);
    expect(column.width / DESIGN.maxWidth).toBeLessThan(0.5);
  });
});

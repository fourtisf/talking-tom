/**
 * The share loop: what gets photographed, and what a share is worth.
 *
 * Both halves are silent when wrong. A crop that cuts her feet off still
 * produces a valid PNG and a share sheet; a bonus that pays twice still looks
 * like a working button. Neither shows up in a screenshot of the happy path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESSORY_ANCHOR, ACCESSORY_BOX, PLACEMENTS } from '@/pet/rigLayout';
import { CARD, captureRegion } from '@/ui/photoCard';
import { Sharing, WebSharePort, type SharePort } from '@/services/Sharing';
import { PHOTO } from '@/config/tuning';

/** The room, at the three widths the game actually renders. */
const SCENE_HEIGHT = 628;
const WIDTHS = [420, 600, 940];

describe('what ends up in the picture', () => {
  it.each(WIDTHS)('crops to the card shape exactly (%ipx)', (width) => {
    const r = captureRegion(width, SCENE_HEIGHT);
    const wanted = CARD.width / (CARD.width / CARD.aspect - CARD.bandHeight);
    // Within a pixel: the region is rounded to whole pixels for the renderer.
    expect(r.width / r.height).toBeCloseTo(wanted, 1);
  });

  it.each(WIDTHS)('keeps the floor rather than the ceiling (%ipx)', (width) => {
    const r = captureRegion(width, SCENE_HEIGHT);
    /*
     * Bottom-anchored. She stands with her feet at 576 of 628 and the top of
     * the room is bare wall, so a centred crop — which is what any naive
     * fit-inside would give — takes the wall and leaves her paws outside the
     * frame. This is the whole reason the function exists.
     */
    expect(r.y + r.height).toBe(SCENE_HEIGHT);
  });

  it.each(WIDTHS)('fits inside the room it is cropping from (%ipx)', (width) => {
    const r = captureRegion(width, SCENE_HEIGHT);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(width);
    expect(r.height).toBeLessThanOrEqual(SCENE_HEIGHT);
  });

  /**
   * THE TIGHTEST THING IN THE FEATURE, and not the ear tips.
   *
   * A hat is not inside the rig's design box. `ACCESSORY_BOX.top` is -124 from
   * an anchor 70 above a head centred at -220, so the crown reaches -414 in a
   * 360-tall box — 54 units out the top of it. On the narrowest room the crop
   * clears that by about twenty pixels, so a taller caption band, a squarer
   * card or a shorter rise all guillotine the crown, and none of them would
   * look wrong in the room. Only here.
   */
  it.each(WIDTHS)('clears the tallest hat, not just her ears (%ipx)', (width) => {
    const r = captureRegion(width, SCENE_HEIGHT);
    const scale = (SCENE_HEIGHT * 0.55) / 360;
    const hatTop =
      576 + (PLACEMENTS.head.y + ACCESSORY_ANCHOR.y + ACCESSORY_BOX.top) * scale;
    expect(r.y).toBeLessThan(hatTop);
  });

  it('centres the crop when the room is wider than the card', () => {
    const r = captureRegion(940, SCENE_HEIGHT);
    expect(r.x).toBe(Math.round((940 - r.width) / 2));
    expect(r.width).toBeLessThan(940);
  });
});

describe('the share, and what it pays', () => {
  const payload = () => ({
    blob: new Blob(['x'], { type: 'image/png' }),
    filename: 'biskit.png',
    text: 'look',
    url: 'https://biskit.fun',
  });

  it('reports unsupported rather than throwing with no port', async () => {
    expect(await new Sharing(null).share(payload())).toBe('unsupported');
  });

  it('refuses a second share while one sheet is open', async () => {
    let release = (): void => undefined;
    const slow: SharePort = {
      id: 'slow',
      share: () => new Promise((r) => { release = () => r('shared'); }),
    };
    const sharing = new Sharing(slow);
    const first = sharing.share(payload());
    // The system sheet is modal; a second call either throws InvalidStateError
    // or stacks a sheet behind the first one, depending on the platform.
    expect(await sharing.share(payload())).toBe('cancelled');
    release();
    expect(await first).toBe('shared');
  });

  it('frees the lock after a port that throws', async () => {
    const bad: SharePort = { id: 'bad', share: () => Promise.reject(new Error('nope')) };
    const sharing = new Sharing(bad);
    expect(await sharing.share(payload())).toBe('failed');
    // If `busy` leaked, every later share would answer 'cancelled' forever.
    sharing.setPort({ id: 'ok', share: () => Promise.resolve('shared') });
    expect(await sharing.share(payload())).toBe('shared');
  });
});

describe('the web port', () => {
  const original = { ...globalThis.navigator };

  beforeEach(() => {
    vi.unstubAllGlobals();
    void original;
  });

  const payload = () => ({
    blob: new Blob(['x'], { type: 'image/png' }),
    filename: 'biskit.png',
    text: 'look',
    url: 'https://biskit.fun',
  });

  it('treats backing out of the sheet as a cancel, not a failure', async () => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('user abort', 'AbortError')),
    });
    // Told "could not share", a player goes looking for a problem that is not
    // there. The distinction is the whole reason the outcome is an enum.
    expect(await new WebSharePort().share(payload())).toBe('cancelled');
  });

  it('falls back to a download when files are refused', async () => {
    let clicked = false;
    vi.stubGlobal('navigator', { canShare: () => false, share: () => Promise.resolve() });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    vi.stubGlobal('document', {
      createElement: () => ({ click: () => { clicked = true; }, href: '', download: '' }),
    });
    // Desktop Chrome and Firefox both expose `share` and both reject a files
    // payload, so probing for the function alone hands you a rejected promise
    // instead of the fallback.
    expect(await new WebSharePort().share(payload())).toBe('downloaded');
    expect(clicked).toBe(true);
  });
});

describe('the daily bonus', () => {
  it('is a real amount', () => {
    expect(PHOTO.dailyCoinBonus).toBeGreaterThan(0);
  });
});

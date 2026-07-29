/**
 * Block boot until the display face is rasterisable.
 *
 * This is not belt-and-braces: Phaser draws a `Text` object into a canvas
 * texture ONCE, at creation. A Text built before the font arrives keeps the
 * fallback glyphs forever — it never re-renders when `document.fonts` settles.
 * `font-display: swap` cannot save us either, because swap repaints DOM text
 * and the game has no DOM text.
 *
 * So the boot chain waits here. The `<link rel="preload">` in play.html means
 * the bytes are usually already in flight by the time this runs, so the wait is
 * normally a microtask rather than a network round trip.
 */

/**
 * Give up after this and let the game draw in the fallback face. A player
 * looking at a slightly wrong font is a much better outcome than a player
 * looking at a black screen because a CDN is having a bad day.
 */
const FONT_TIMEOUT_MS = 2500;

/** The faces that must exist before the first scene draws. */
const REQUIRED = ['500 16px Fredoka', '700 16px Fredoka'] as const;

export async function waitForFonts(timeoutMs = FONT_TIMEOUT_MS): Promise<boolean> {
  // Node/test environments and very old webviews have no font loading API.
  if (typeof document === 'undefined' || !('fonts' in document)) return false;

  const load = Promise.all(REQUIRED.map((face) => document.fonts.load(face)))
    .then(() => document.fonts.ready)
    .then(() => true);

  // `document.fonts.load` never rejects on a missing file — it resolves with an
  // empty match list — so the timeout is what actually bounds this, not a catch.
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), timeoutMs);
  });

  try {
    return await Promise.race([load, timeout]);
  } catch {
    return false;
  }
}

/**
 * Shared UI constants: fonts, radii, depths.
 *
 * NOTE on fonts: the prototype pulls Fredoka and Plus Jakarta Sans from Google
 * Fonts. A packaged app cannot depend on a network fetch at boot, so the stacks
 * below fall back to the platform UI font. Drop the two woff2 files into
 * `public/fonts/` and add an `@font-face` in `play.html` to get the intended
 * look — nothing else needs to change.
 */

/**
 * Fredoka is shipped in `public/fonts/` and declared in play.html; boot blocks
 * on it via `waitForFonts()`, because a Phaser Text rasterises once and keeps
 * whatever face it was built with.
 *
 * Plus Jakarta Sans is deliberately NOT in the body stack any more. It was
 * never shipped either, so it only ever resolved to the platform font — and
 * paying a second ~30KB to formalise what a platform UI font already does well
 * for body copy is not a trade worth making on a phone.
 */
export const FONT_DISPLAY = 'Fredoka, system-ui, sans-serif';
export const FONT_BODY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Render order. Higher is closer to the player. */
export const DEPTH = {
  room: 0,
  props: 5,
  petShadow: 12,
  pet: 14,
  sceneOverlay: 20,
  fx: 44,
  dock: 42,
  topBar: 40,
  sideButtons: 38,
  toast: 95,
  sheet: 90,
} as const;

/** The design resolution the whole UI is laid out against. */
export const DESIGN = {
  width: 420,
  height: 860,
  pad: 14,
  /**
   * On a wide screen the canvas widens to match, so the room fills the display
   * instead of sitting in a narrow strip.
   *
   * 1560 is chosen, not round: a 16:9 display asks for 860 * 16/9 = 1529, so
   * the commonest desktop shape is covered edge to edge with a little room
   * over. Wider than this (ultrawide, or a short browser window) is capped on
   * purpose — the room becomes mostly empty floor with the pet a speck in the
   * middle of it, and the page gradient behind the canvas covers the rest.
   */
  maxWidth: 1560,
  /**
   * Controls are NOT stretched to the canvas. Four meters spread across 1560px
   * stop reading as meters, and five nav tabs that far apart stop reading as a
   * bar. They stay in a centred column of at most this width.
   */
  uiMaxWidth: 600,
  /**
   * Room PROPS are anchored to the room's own edges (the shelf at x 16, the
   * picture at width - 80), so a full-canvas room throws them into the far
   * corners of a wide screen with nothing between them and the pet. They get a
   * column of their own — wider than the controls, so the scene still feels
   * roomy, but tight enough that the furniture still frames the cat.
   *
   * The wall and floor are drawn separately and DO span the whole canvas.
   */
  roomMaxWidth: 940,
} as const;

/**
 * The canvas size to build the game at, from the window it has to live in.
 *
 * Portrait screens keep the 420-wide design exactly as before; a landscape one
 * gets a canvas as wide as its aspect ratio asks for, up to the cap. Height is
 * fixed, so `Scale.FIT` still fills the screen vertically either way.
 */
export function designSizeFor(windowWidth: number, windowHeight: number): {
  width: number;
  height: number;
} {
  if (windowWidth <= 0 || windowHeight <= 0) {
    return { width: DESIGN.width, height: DESIGN.height };
  }
  const wanted = Math.round(DESIGN.height * (windowWidth / windowHeight));
  return {
    width: Math.min(DESIGN.maxWidth, Math.max(DESIGN.width, wanted)),
    height: DESIGN.height,
  };
}

/** A centred column of at most `max`, within a canvas of `canvasWidth`. */
function centred(canvasWidth: number, max: number): { left: number; width: number } {
  const width = Math.min(canvasWidth, max);
  return { left: Math.round((canvasWidth - width) / 2), width };
}

/** The centred column the controls live in, given the canvas width. */
export function uiColumn(canvasWidth: number): { left: number; width: number } {
  return centred(canvasWidth, DESIGN.uiMaxWidth);
}

/** The centred column the room's furniture is composed in. */
export function roomColumn(canvasWidth: number): { left: number; width: number } {
  return centred(canvasWidth, DESIGN.roomMaxWidth);
}

export const RADIUS = {
  pill: 999,
  card: 16,
  button: 18,
  sheet: 30,
} as const;

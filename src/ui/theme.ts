/**
 * Shared UI constants: fonts, radii, depths.
 *
 * NOTE on fonts: the prototype pulls Fredoka and Plus Jakarta Sans from Google
 * Fonts. A packaged app cannot depend on a network fetch at boot, so the stacks
 * below fall back to the platform UI font. Drop the two woff2 files into
 * `public/fonts/` and add an `@font-face` in `index.html` to get the intended
 * look — nothing else needs to change.
 */

export const FONT_DISPLAY = 'Fredoka, "Plus Jakarta Sans", system-ui, sans-serif';
export const FONT_BODY = '"Plus Jakarta Sans", system-ui, sans-serif';

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
} as const;

export const RADIUS = {
  pill: 999,
  card: 16,
  button: 18,
  sheet: 30,
} as const;

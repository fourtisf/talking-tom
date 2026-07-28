/**
 * Colour tokens, lifted from the prototype's `:root` block.
 *
 * Values are numeric so they can be handed straight to Phaser (`0xRRGGBB`).
 * `css()` is provided for the few places that need a string (DOM overlays).
 *
 * This file is presentation only — no balance numbers live here.
 */

export const PALETTE = {
  ink: 0x33243f,
  ink2: 0x5b486b,

  wall: 0xdccef3,
  wallLo: 0xbca6e4,
  wallHi: 0xede4fb,

  floor: 0xefd3ae,
  floorLo: 0xd6b085,

  fur: 0xffffff,
  furSh: 0xede2f6,
  furSh2: 0xdcccee,

  line: 0x7a6494,
  prop: 0xa995c4,

  blue: 0x4ba8e8,
  blueLo: 0x2a72b8,

  stripe: 0xee9a52,

  cream: 0xfffbf7,
  pink: 0xff9ec4,
  pinkLo: 0xe877a8,
  inner: 0xffc4d6,

  coral: 0xff8faf,
  coralLo: 0xe06a8d,

  butter: 0xffd46b,
  butterLo: 0xdda524,
  goldText: 0x8a5a00,

  mint: 0x7fd9b8,
  mintLo: 0x4fbe96,

  grape: 0xa88bd8,
  grapeLo: 0x8367bc,

  sky: 0x6ec5e9,

  /** Meter accents — one per stat, in the prototype's order. */
  meterHunger: 0xff6b6b,
  meterEnergy: 0xffc94d,
  meterFun: 0x4ed6a0,
  meterClean: 0x6ec5e9,

  /** Pet detail colours. */
  irisHi: 0x8fd4f7,
  mouthInner: 0xe2739a,
  blushFill: 0xff8cb8,
  eyeWhite: 0xffffff,
  pupil: 0x2a2038,
  bellyFill: 0xfff3f8,

  white: 0xffffff,
  black: 0x000000,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** `0x33243f` -> `'#33243f'`. */
export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Backdrop the whole app sits on, matching the prototype's body gradient midpoint. */
export const BACKDROP = 0x2e2340;

/** Night filter applied while the pet sleeps (multiplied over the scene tint). */
export const NIGHT_TINT = 0x8a7ba8;

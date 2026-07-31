/**
 * Turning a frame of the game into something worth posting.
 *
 * A raw screenshot is not shareable. It is 420px of room with a status bar
 * across the top, an aspect ratio no feed wants, and nothing on it that says
 * where it came from. This does three things to fix that, and each of them is
 * the reason the file exists rather than a `toDataURL` call at the call site.
 *
 * ASPECT. Feeds crop to 4:5 or square and crop from the CENTRE, which on a
 * 420x628 room would cut her feet off and keep the ceiling. The capture region
 * is picked to be 4:5 including the caption band, anchored to the BOTTOM of
 * the room so the floor and the cat survive and the empty wall is what goes.
 *
 * RESOLUTION. The canvas backs at the design size — 420 wide, whatever the
 * screen — so 420px is genuinely every pixel there is. Composed at 2x with
 * smoothing on, which is the right call for flat vector art with hard outlines
 * and would be the wrong one for a photograph.
 *
 * ATTRIBUTION. A caption band with her name and the domain. Not a translucent
 * watermark over the art: those get cropped off, read as a stock-photo bar, and
 * make the picture worse. A solid band under the picture is part of the card.
 *
 * Deliberately free of Phaser. It takes an image and returns a blob, so it can
 * be reasoned about — and its geometry tested — without a canvas context.
 */

/** Width of the finished card, and the shape feeds want. */
export const CARD = {
  width: 840,
  /** 4:5 portrait, the tallest a feed will show without cropping. */
  aspect: 0.8,
  bandHeight: 112,
} as const;

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The slice of the room to photograph.
 *
 * The largest rectangle of the right shape that fits, pinned to the bottom
 * edge and centred horizontally. Bottom-pinned rather than centred because
 * everything worth keeping is low: she stands with her feet at 576 of 628, and
 * the top of the room is wall. On a wide screen the limit is the height
 * instead and the crop closes in from the sides, which is also correct — the
 * wide room is mostly floor either side of her.
 */
export function captureRegion(roomWidth: number, roomHeight: number): CaptureRegion {
  const pictureAspect = CARD.width / (CARD.width / CARD.aspect - CARD.bandHeight);
  let width = roomWidth;
  let height = width / pictureAspect;
  if (height > roomHeight) {
    height = roomHeight;
    width = height * pictureAspect;
  }
  return {
    x: Math.round((roomWidth - width) / 2),
    y: Math.round(roomHeight - height),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export interface CardText {
  /** Her name, large. The player named her; it is the point of the card. */
  name: string;
  /** The small line under it. */
  caption: string;
}

/**
 * Draw the card. Returns the canvas so the caller decides blob vs data URL.
 *
 * `source` is whatever `snapshotArea` handed back, already cropped by the
 * renderer — this only scales it. Passing the full frame and cropping here
 * would work too and would cost a second full-size copy on a phone.
 */
export function drawCard(
  source: CanvasImageSource,
  text: CardText,
  create: (w: number, h: number) => HTMLCanvasElement,
): HTMLCanvasElement {
  const height = Math.round(CARD.width / CARD.aspect);
  const pictureHeight = height - CARD.bandHeight;
  const canvas = create(CARD.width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Smoothing ON: this is a 2x upscale of flat fills and 2px outlines. Nearest
  // neighbour would keep the outlines crisp and turn every curve in the room
  // into a staircase, which is the more noticeable of the two artefacts.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, CARD.width, pictureHeight);

  // The band.
  ctx.fillStyle = '#221a33';
  ctx.fillRect(0, pictureHeight, CARD.width, CARD.bandHeight);
  // A hairline of the picture's own light along the top of it, so the band
  // reads as part of the card rather than as a bar someone stuck on.
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, pictureHeight, CARD.width, 3);

  const bandMid = pictureHeight + CARD.bandHeight / 2;
  const font = "700 44px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fffbf7';
  ctx.fillText(text.name, 44, bandMid - 15);

  ctx.font = "600 26px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = '#b3a6c9';
  ctx.fillText(text.caption, 44, bandMid + 26);

  ctx.textAlign = 'right';
  ctx.font = "700 30px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = '#ffd46b';
  ctx.fillText('biskit.fun', CARD.width - 44, bandMid);

  return canvas;
}

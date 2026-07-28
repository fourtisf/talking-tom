/**
 * Turn drawn vector art into a cached texture.
 *
 * Phaser re-tessellates and re-uploads a `Graphics` object on every single
 * frame. That is fine for a handful; this game has a rig, a dock, five nav
 * tabs and a tray of buttons, and the cost adds up to the whole frame budget.
 *
 * Baking draws the art once into a texture and hands back an `Image`, which is
 * one quad in a batch. Because the texture is keyed and cached, the five nav
 * icons that share a shape also share a texture, as does every fish in the
 * mini-game.
 *
 * Art is drawn at `SUPERSAMPLE` times its display size so it stays crisp when
 * the FIT scale mode upsizes the canvas on a big screen.
 */

import type Phaser from 'phaser';

export const SUPERSAMPLE = 2;

/** Local-space rectangle a piece of art draws into. */
export interface ArtBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function boxSize(box: ArtBox): { width: number; height: number } {
  return { width: box.right - box.left, height: box.bottom - box.top };
}

/**
 * Bake `draw` into a cached texture and return an Image whose origin sits at
 * the art's local (0, 0).
 *
 * `key` must capture everything that changes the pixels — size, colour, shape —
 * or two different icons will collide on one texture.
 */
export function bakeArt(
  scene: Phaser.Scene,
  key: string,
  box: ArtBox,
  draw: (graphics: Phaser.GameObjects.Graphics) => void,
  supersample: number = SUPERSAMPLE,
): Phaser.GameObjects.Image {
  const { width, height } = boxSize(box);
  const texWidth = Math.max(1, Math.ceil(width * supersample));
  const texHeight = Math.max(1, Math.ceil(height * supersample));

  if (!scene.textures.exists(key)) {
    const graphics = scene.make.graphics({}, false);
    graphics.setScale(supersample);
    draw(graphics);

    const target = scene.make.renderTexture(
      { width: texWidth, height: texHeight },
      false,
    );
    // Place the art's local origin at (-left, -top) inside the texture.
    target.draw(graphics, -box.left * supersample, -box.top * supersample);
    target.saveTexture(key);

    graphics.destroy();
    // The RenderTexture object itself is no longer needed; the texture it
    // saved outlives it and is what the Images reference.
    target.destroy();
  }

  const image = scene.add.image(0, 0, key);
  image.setOrigin(-box.left / width, -box.top / height);
  image.setScale(1 / supersample);
  return image;
}

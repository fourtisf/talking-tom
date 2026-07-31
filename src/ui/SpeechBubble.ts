/**
 * The bubble she talks in.
 *
 * Separate from `HomeScene`'s ask-bubble, which carries one icon and stays up
 * until the need is met. This one carries a sentence, wraps it, resizes to it
 * and takes itself away — three things the icon version never has to do, and
 * bolting them on would have made the one piece of UI that must be unmissable
 * (the toilet ask) share a code path with the one that must be ignorable.
 *
 * BUILT ONCE, REUSED. Making a bubble per line means a Graphics allocation and
 * a text-measure pass every time she opens her mouth, on the frame she opens
 * it. The shape is redrawn on show — cheap, it is nine draw calls — and the
 * container is only ever created here.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { FONT_BODY } from '@/ui/theme';

/** Widest the bubble is allowed to get before the text wraps instead. */
const MAX_TEXT_WIDTH = 190;
const PAD_X = 16;
const PAD_Y = 12;
const TAIL = 15;

export class SpeechBubble extends Phaser.GameObjects.Container {
  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private hideCall: Phaser.Time.TimerEvent | null = null;
  /** Which way the tail points: -1 when she is on the right of the bubble. */
  private tailDir: -1 | 1 = 1;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.shape = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_BODY,
        fontSize: '15px',
        color: '#2c2140',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: MAX_TEXT_WIDTH },
      })
      .setOrigin(0.5);
    this.add([this.shape, this.label]);
    this.setVisible(false).setAlpha(0);
    scene.add.existing(this);
  }

  /**
   * Say something above `anchor`, for `holdMs`.
   *
   * The bubble is placed by its TAIL rather than its centre, because the tail
   * is the end that has to touch her: a centred bubble whose text happens to
   * wrap to two lines grows upward and downward equally and the tail ends up
   * inside her ear.
   */
  say(text: string, anchor: { x: number; y: number }, holdMs: number, rightLimit: number): void {
    this.label.setText(text);
    const w = Math.ceil(this.label.width) + PAD_X * 2;
    const h = Math.ceil(this.label.height) + PAD_Y * 2;

    /*
     * Which side of her it sits on, decided by the room and not by taste.
     *
     * Right of her by default, flipping left — tail and all — when it will not
     * fit. `rightLimit` is the SIDE RAIL, not the canvas edge: on a wide screen
     * there is plenty of canvas to the right of her and the tasks, shop, ad and
     * camera buttons are all sitting in it, so a bubble sized against the
     * canvas clears the bezel and lands squarely on the buttons instead.
     */
    const wantRight = anchor.x + w + 24 < rightLimit;
    this.tailDir = wantRight ? 1 : -1;
    const cx = anchor.x + (wantRight ? w / 2 : -w / 2);
    this.setPosition(cx, anchor.y - h / 2 - TAIL);
    this.label.setPosition(0, 0);
    this.draw(w, h);

    this.hideCall?.remove();
    this.scene.tweens.killTweensOf(this);
    this.setVisible(true).setAlpha(0).setScale(0.7);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.hideCall = this.scene.time.delayedCall(holdMs, () => this.hide());
  }

  hide(): void {
    this.hideCall?.remove();
    this.hideCall = null;
    if (!this.visible) return;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 0.8,
      duration: 180,
      ease: 'Quad.easeIn',
      onComplete: () => this.setVisible(false),
    });
  }

  private draw(w: number, h: number): void {
    const g = this.shape;
    g.clear();
    g.fillStyle(PALETTE.cream, 1);
    g.lineStyle(4, PALETTE.ink, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);

    /*
     * The tail, drawn INSIDE the outline and then patched over.
     *
     * A stroked triangle butted against a stroked rectangle leaves the body's
     * own outline running straight across the tail's mouth, so it reads as a
     * bubble with a fin rather than a bubble with a tail. Filling the triangle,
     * stroking only its two free sides, and then laying a fill-coloured bar
     * over the seam is the cheapest way to get one continuous silhouette out
     * of two shapes.
     */
    const rootX = this.tailDir * (w / 2 - 34);
    const y = h / 2;
    g.fillStyle(PALETTE.cream, 1);
    g.fillTriangle(rootX, y - 2, rootX + this.tailDir * 20, y - 2, rootX + this.tailDir * 4, y + TAIL);
    g.lineStyle(4, PALETTE.ink, 1);
    g.lineBetween(rootX, y - 1, rootX + this.tailDir * 4, y + TAIL);
    g.lineBetween(rootX + this.tailDir * 20, y - 1, rootX + this.tailDir * 4, y + TAIL);
    g.fillStyle(PALETTE.cream, 1);
    g.fillRect(Math.min(rootX, rootX + this.tailDir * 20) + 2, y - 4, 16, 5);
  }
}

/**
 * Bath time: pick up a tool and rub her with it.
 *
 * The old bath was two buttons, both wired to the same handler, both adding 11
 * to a number. This is the same gesture hand feeding uses — press a tile, pull
 * it onto her, and the work happens where your finger is — except that instead
 * of one target there is a whole cat to cover, and instead of counting bites it
 * counts DISTANCE RUBBED. Holding a brush still against her does nothing; that
 * is the difference between scrubbing and pressing a button slowly.
 *
 * Owns the dragged tool and nothing else. What each tool does when it lands is
 * `HomeScene`'s business, and what it does to her coat is `Grime`'s.
 */

import Phaser from 'phaser';

import { BATHING } from '@/config/tuning';
import { PALETTE } from '@/config/palette';
import { TOOLS, makeTool, type ToolId } from '@/pet/BathArt';
import type { Contact, Grime } from '@/pet/Grime';

export interface BathSessionOptions {
  readonly scene: Phaser.Scene;
  readonly grime: Grime;
  readonly tool: ToolId;
  /** The tray tile it was pulled out of, and where it flies back to. */
  readonly from: { x: number; y: number };
  readonly depth: number;
  /** One rub landed on her. `where` says what the tool's tip was over. */
  readonly onRub: (where: Exclude<Contact, null>, at: { x: number; y: number }) => void;
  /** Let go. `rubs` is how many landed in total, zero included. */
  readonly onFinished: (rubs: number) => void;
}

export class BathSession {
  private readonly scene: Phaser.Scene;
  private readonly options: BathSessionOptions;
  private readonly holder: Phaser.GameObjects.Container;

  private last: Phaser.Math.Vector2 | null = null;
  private travel = 0;
  private rubs = 0;
  private touching = false;
  private done = false;

  constructor(options: BathSessionOptions) {
    this.scene = options.scene;
    this.options = options;

    this.holder = this.scene.add
      .container(options.from.x, options.from.y)
      .setDepth(options.depth);
    this.holder.add(makeTool(this.scene, options.tool, BATHING.toolSize));
    this.holder.setScale(0.5);
    this.scene.tweens.add({
      targets: this.holder,
      scale: 1,
      duration: 160,
      ease: 'Back.easeOut',
    });
  }

  get tool(): ToolId {
    return this.options.tool;
  }

  /** Scene-space position of the end that does the work. */
  private tip(): { x: number; y: number } {
    const offset = TOOLS[this.options.tool].tip;
    return { x: this.holder.x + offset.x, y: this.holder.y + offset.y };
  }

  /** Driven by the tray's drag events. */
  moveTo(x: number, y: number): void {
    if (this.done) return;
    this.holder.setPosition(x, y);

    const here = new Phaser.Math.Vector2(x, y);
    const moved = this.last ? Phaser.Math.Distance.BetweenPoints(this.last, here) : 0;
    this.last = here;

    const tip = this.tip();
    const contact = this.options.grime.contactAt(tip.x, tip.y);
    this.setTouching(contact !== null);
    if (!contact) {
      // Travel off the cat is not scrubbing, and letting it bank means a long
      // sweep through empty space pays out the moment it arrives.
      this.travel = 0;
      return;
    }

    this.travel += moved;
    if (this.travel < BATHING.rubPerTick) return;
    this.travel = 0;
    this.rubs += 1;
    this.options.onRub(contact, tip);
  }

  /**
   * The tool tips into the work when it is on her.
   *
   * Without it there is no way to tell the difference between a tool hovering
   * over the cat and one actually touching her, and the player is left guessing
   * why nothing is happening.
   */
  private setTouching(on: boolean): void {
    if (this.touching === on) return;
    this.touching = on;
    this.scene.tweens.killTweensOf(this.holder);
    if (on) {
      this.scene.tweens.add({
        targets: this.holder,
        angle: { from: -9, to: 9 },
        duration: 180,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.scene.tweens.add({
        targets: this.holder,
        angle: 0,
        duration: 140,
        ease: 'Sine.easeOut',
      });
    }
  }

  /** Splash marks where the tool is working, so a rub has a sound in pictures. */
  sparkle(at: { x: number; y: number }, tint: number = PALETTE.white): void {
    for (let i = 0; i < 3; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dot = this.scene.add
        .circle(at.x, at.y, Phaser.Math.Between(3, 6), tint)
        .setDepth(this.options.depth);
      this.scene.tweens.add({
        targets: dot,
        x: at.x + Math.cos(angle) * Phaser.Math.Between(24, 54),
        y: at.y + Math.sin(angle) * Phaser.Math.Between(24, 54),
        alpha: 0,
        scale: 0.4,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** The finger came up. The tool goes back on the shelf. */
  release(): void {
    if (this.done) return;
    this.done = true;
    this.scene.tweens.killTweensOf(this.holder);
    this.scene.tweens.add({
      targets: this.holder,
      x: this.options.from.x,
      y: this.options.from.y,
      scale: 0.4,
      alpha: 0,
      angle: 0,
      duration: BATHING.returnMs,
      ease: 'Quad.easeIn',
      onComplete: () => this.holder.destroy(true),
    });
    this.options.onFinished(this.rubs);
  }

  /** Room change, or a sheet opening mid-rub. */
  destroy(): void {
    if (this.done) return;
    this.done = true;
    this.scene.tweens.killTweensOf(this.holder);
    this.holder.destroy(true);
    this.options.onFinished(this.rubs);
  }
}

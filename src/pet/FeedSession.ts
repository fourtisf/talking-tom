/**
 * Hand feeding: drag the food to her mouth and she takes it, a bite at a time.
 *
 * Tapping a tray tile used to add hunger instantly. That is a spreadsheet in a
 * cat costume — the most-repeated action in the game asked nothing of the
 * player and gave back a number. Here the player has to actually reach her, she
 * opens her mouth when the food is close enough that she has clearly noticed
 * it, and she leans in for the bite.
 *
 * Owns the dragged object and nothing else. Payment, stats, XP and analytics
 * stay with the caller — this reports "a bite happened" and "the last bite
 * happened", and HomeScene decides what those are worth.
 */

import Phaser from 'phaser';

import { FEEDING } from '@/config/tuning';
import { PALETTE } from '@/config/palette';
import { makeFood } from '@/pet/FoodArt';
import type { PetAnimator } from '@/pet/PetAnimator';
import type { PetRig } from '@/pet/PetRig';

export interface FeedSessionOptions {
  readonly scene: Phaser.Scene;
  readonly rig: PetRig;
  readonly animator: PetAnimator;
  /** Food id, so the morsel can be the real thing rather than a scaled icon. */
  readonly foodId: string;
  /** Where the morsel starts — the tray tile that was tapped. */
  readonly from: { x: number; y: number };
  /**
   * Where what is left of the meal WAITS between bites. Defaults to `from`.
   *
   * An item is three bites, and until the kitchen had a table the remainder
   * flew back to the tray tile it came out of, which is off at the bottom of
   * the screen behind the meters. With a plate in front of her it goes there
   * instead, and the second and third pulls start from the dish — which is
   * what eating at a table actually looks like, and a shorter reach besides.
   *
   * It is NOT where an abandoned meal goes. Giving up puts the food back where
   * the player got it from; leaving it on the table would say the purchase
   * still stands when nothing has been paid for.
   */
  readonly restAt?: { x: number; y: number };
  readonly depth: number;
  /** One bite landed. Fired `FEEDING.bites` times across a whole item. */
  readonly onBite: (biteIndex: number) => void;
  /** Every bite taken. The item is gone. */
  readonly onFinished: () => void;
  /** Dropped away from her and given up on, or interrupted. Nothing was eaten. */
  readonly onAbandoned: () => void;
}

export class FeedSession {
  private readonly scene: Phaser.Scene;
  private readonly rig: PetRig;
  private readonly animator: PetAnimator;
  private readonly options: FeedSessionOptions;

  private readonly morsel: Phaser.GameObjects.Container;
  private bitesTaken = 0;
  private mouthOpen = false;
  private done = false;

  constructor(options: FeedSessionOptions) {
    this.scene = options.scene;
    this.rig = options.rig;
    this.animator = options.animator;
    this.options = options;

    this.morsel = this.scene.add.container(options.from.x, options.from.y).setDepth(options.depth);
    // The held drawing, not the tray pictogram. A 24px symbol scaled to 62 is
    // an orange oval with a triangle on it; under a finger it needs to be an
    // object.
    this.morsel.add(makeFood(this.scene, options.foodId, FEEDING.size));

    /*
     * The TRAY owns the drag, not this object.
     *
     * The first version made the morsel itself draggable, which meant tapping a
     * tile to pick it up and then a second press to drag it. Phaser ended the
     * second drag the instant it began — the tap's pointer-up and the drag's
     * pointer-down landed close enough together to cancel each other — and the
     * food never moved. Chasing that was the wrong fix: nobody wants two
     * gestures. Press the fish in the tray and pull it to her mouth is one.
     */
    this.morsel.setScale(0.55);
    this.scene.tweens.add({
      targets: this.morsel,
      scale: 1,
      duration: 160,
      ease: 'Back.easeOut',
    });
  }

  /** Driven by the tray's drag events. */
  moveTo(x: number, y: number): void {
    if (this.done) return;
    this.morsel.setPosition(x, y);
    this.updateAnticipation();
  }

  /** The finger came up. Bite if she can reach it, otherwise give it back. */
  release(): void {
    this.onRelease();
  }

  /** Mouth position in scene space — the bones are nested several deep. */
  private mouthPoint(): Phaser.Math.Vector2 {
    const matrix = this.rig.bone('mouth').getWorldTransformMatrix();
    return new Phaser.Math.Vector2(matrix.tx, matrix.ty);
  }

  private distanceToMouth(): number {
    const mouth = this.mouthPoint();
    return Phaser.Math.Distance.Between(this.morsel.x, this.morsel.y, mouth.x, mouth.y);
  }

  /**
   * She opens up when the food is close, and shuts again if it goes away.
   *
   * This is the entire tell that the drop will work. Without it the player is
   * guessing where the target is, and a missed drop feels like the game failed
   * rather than like they missed.
   */
  private updateAnticipation(): void {
    if (this.done) return;
    const near = this.distanceToMouth() <= FEEDING.openRadius;
    if (near === this.mouthOpen) return;
    this.mouthOpen = near;
    this.rig.setMouth(near ? 'open' : 'norm');
  }

  private onRelease(): void {
    if (this.done) return;

    if (this.distanceToMouth() > FEEDING.biteRadius) {
      this.returnHome();
      return;
    }
    this.takeBite();
  }

  private takeBite(): void {
    this.bitesTaken += 1;
    const index = this.bitesTaken;

    const mouth = this.mouthPoint();
    this.spawnCrumbs(mouth);

    // She leans into it rather than the food simply vanishing.
    const head = this.rig.bone('head');
    this.scene.tweens.add({
      targets: head,
      y: head.y + FEEDING.leanPx,
      duration: FEEDING.leanMs,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    this.animator.play('eat');

    this.options.onBite(index);

    if (index >= FEEDING.bites) {
      this.finish();
      return;
    }

    // What is left shrinks and settles where the meal waits, ready for the
    // next go — the plate in the kitchen, the tray tile everywhere else.
    const rest = this.options.restAt ?? this.options.from;
    this.scene.tweens.add({
      targets: this.morsel,
      x: rest.x,
      y: rest.y,
      scale: 1 - FEEDING.shrinkPerBite * index,
      duration: FEEDING.returnMs,
      ease: 'Quad.easeOut',
      /*
       * Shut her mouth again when the food has gone.
       *
       * `updateAnticipation` only ran on pointer moves, so after a bite she
       * held her jaw open until the player started the next drag. Off-screen
       * at the bottom of the tray nobody noticed; resting on a plate a hand's
       * width from her face, a cat sitting with her mouth hanging open is the
       * first thing you see.
       */
      onComplete: () => this.updateAnticipation(),
    });
  }

  private spawnCrumbs(at: Phaser.Math.Vector2): void {
    for (let i = 0; i < FEEDING.crumbs; i++) {
      const crumb = this.scene.add
        .circle(at.x, at.y, Phaser.Math.Between(2, 4), PALETTE.butter)
        .setDepth(this.options.depth);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const reach = Phaser.Math.Between(18, 46);
      this.scene.tweens.add({
        targets: crumb,
        x: at.x + Math.cos(angle) * reach,
        y: at.y + Math.sin(angle) * reach + 16,
        alpha: 0,
        scale: 0.3,
        duration: FEEDING.crumbMs,
        ease: 'Quad.easeOut',
        onComplete: () => crumb.destroy(),
      });
    }
  }

  private returnHome(): void {
    this.scene.tweens.add({
      targets: this.morsel,
      x: this.options.from.x,
      y: this.options.from.y,
      scale: 0.4,
      alpha: 0,
      duration: FEEDING.returnMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.cleanup();
        this.options.onAbandoned();
      },
    });
  }

  private finish(): void {
    this.done = true;
    this.morsel.destroy(true);
    this.rig.setMouth('norm');
    this.options.onFinished();
  }

  private cleanup(): void {
    this.done = true;
    this.morsel.destroy(true);
    if (this.mouthOpen) this.rig.setMouth('norm');
  }

  /** Called when the room changes or a sheet opens mid-drag. */
  destroy(): void {
    if (this.done) return;
    this.cleanup();
    this.options.onAbandoned();
  }
}

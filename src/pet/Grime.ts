/**
 * What is on her coat: dirt, and the suds that take it off.
 *
 * DIRT IS ATTACHED TO THE RIG, not drawn over the screen at her last known
 * position. The smudges are children of the body and head bones, so they follow
 * her through every animation, every room and the whole lie-down-on-the-bed
 * rotation for free — and a smudge that slides off the cat when she hops is the
 * one bug this design cannot have.
 *
 * It also means dirt shows EVERYWHERE, not only in the bathroom. A cleanliness
 * meter quietly draining in the corner asks the player to read a number; a cat
 * with muck on her nose asks them to do something about it.
 */

import Phaser from 'phaser';

import { BATHING } from '@/config/tuning';
import { makeFoam, makeOpenMouth, makePlaque, makeSmudge } from '@/pet/BathArt';
import { DIRT_SPOTS, type SpotDef } from '@/pet/grimeSpots';
import type { BoneKey, PetRig } from '@/pet/PetRig';
import { HEAD_RADIUS, TORSO_HALF_WIDTH } from '@/pet/rigLayout';

interface Spot {
  readonly def: SpotDef;
  readonly image: Phaser.GameObjects.Image;
  rubs: number;
  going: boolean;
}

export type Contact = 'body' | 'head' | 'mouth' | null;

export class Grime {
  private readonly scene: Phaser.Scene;
  private readonly rig: PetRig;
  private readonly spots: Spot[] = [];
  private readonly foam: Phaser.GameObjects.Image[] = [];
  /** How many smudges this dirty spell has laid down. See `setClean`. */
  private placed = 0;
  /** The mouth overlay, only while the toothbrush is out. */
  private teeth: Phaser.GameObjects.Image | null = null;
  private plaque: Phaser.GameObjects.Image | null = null;
  /** Whether this dirty spell still has plaque to brush off. */
  private plaqueLeft = false;

  constructor(scene: Phaser.Scene, rig: PetRig) {
    this.scene = scene;
    this.rig = rig;
  }

  get dirtLeft(): number {
    return this.spots.filter((s) => !s.going).length;
  }

  get foamCount(): number {
    return this.foam.length;
  }

  get lathered(): boolean {
    return this.foam.length >= BATHING.lather;
  }

  /**
   * Add whatever dirt `clean` now implies.
   *
   * ONE DIRECTION ONLY, and that is the whole subtlety here. The obvious
   * version derives the count both ways and re-syncs — which fights the player,
   * because scrubbing a smudge RAISES cleanliness, the derived count drops, and
   * the re-sync helpfully removes a different smudge from the far side of the
   * cat. Rub her shoulder, watch her ear come clean.
   *
   * So `placed` counts what this dirty spell has laid down, not what is still
   * on her. Cleanliness falling past a threshold adds another smudge; only the
   * brush and the rinse take them off; and reaching spotless forgets the tally
   * so the next spell starts over.
   */
  setClean(clean: number): void {
    const target = Phaser.Math.Clamp(
      Math.ceil((1 - clean / BATHING.showDirtBelow) * DIRT_SPOTS.length),
      0,
      DIRT_SPOTS.length,
    );
    if (target === 0) {
      for (const spot of [...this.spots]) this.lift(spot);
      this.placed = 0;
      // Spotless forgets the plaque too, so the next grubby spell has teeth
      // worth brushing again.
      this.plaqueLeft = false;
      this.plaque?.destroy();
      this.plaque = null;
      return;
    }
    if (this.placed === 0) this.plaqueLeft = true;
    while (this.placed < target) this.add(this.placed++);
  }

  private add(index: number): void {
    const def = DIRT_SPOTS[index];
    if (!def) return;
    const image = makeSmudge(this.scene, index + 1, def.size)
      .setPosition(def.x, def.y)
      .setAlpha(0);

    /*
     * UNDER whatever she is wearing, and this was the bug.
     *
     * `add` appends, and both clothing slots are already children of these two
     * bones — `outfit` of `body`, `accessory` of `head` — so every smudge
     * landed on TOP of them. The forehead spot sits at head-space -66 and the
     * hat anchor is -70, four pixels apart, so it drew squarely on the crown of
     * the wizard hat: a brown blob on her head, in the lavatory. The owner did
     * not need to be told what that read as.
     *
     * It is not only the hat. A smudge is 42%-alpha brown, drawn to sit on
     * WHITE fur; composited over blue dungarees it comes out olive and over a
     * purple hat it comes out muddy. There is no tone that works on fur and on
     * every garment at once, so the answer is not a colour, it is the order:
     * dirt is on the cat, clothes are over the cat.
     */
    const parent = this.rig.bone(def.bone);
    parent.add(image);
    const worn = this.rig.bone(def.bone === 'head' ? 'accessory' : 'outfit');
    // Widened explicitly: `moveBelow<T>` infers T from the first argument, so
    // an Image and a Container cannot be compared without saying what they
    // have in common.
    if (worn.parentContainer === parent) {
      parent.moveBelow<Phaser.GameObjects.GameObject>(image, worn);
    }
    this.spots.push({ def, image, rubs: 0, going: false });
    this.scene.tweens.add({ targets: image, alpha: 1, duration: 420, ease: 'Sine.easeOut' });
  }

  /** Fade one off and forget it. */
  private lift(spot: Spot | undefined): void {
    if (!spot || spot.going) return;
    spot.going = true;
    this.scene.tweens.add({
      targets: spot.image,
      alpha: 0,
      scale: spot.image.scale * 1.4,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => {
        spot.image.destroy();
        const at = this.spots.indexOf(spot);
        if (at >= 0) this.spots.splice(at, 1);
      },
    });
  }

  /** Scene-space position of a bone. */
  private boneAt(bone: BoneKey): Phaser.Math.Vector2 {
    const m = this.rig.bone(bone).getWorldTransformMatrix();
    return new Phaser.Math.Vector2(m.tx, m.ty);
  }

  /** The rig's on-screen scale, read off the transform so animation is included. */
  private get scale(): number {
    return this.rig.bone('body').getWorldTransformMatrix().scaleX || 1;
  }

  /**
   * What a tool at this point is touching, if anything.
   *
   * The mouth wins over the head: a toothbrush has to be able to find her teeth
   * and nothing else on the face is a target, so the smaller circle is tested
   * first and reported instead.
   */
  contactAt(x: number, y: number): Contact {
    const scale = this.scale;
    const reach = BATHING.reach * scale;
    const mouth = this.boneAt('mouth');
    if (Phaser.Math.Distance.Between(x, y, mouth.x, mouth.y) <= reach * 0.8) return 'mouth';

    const head = this.boneAt('head');
    if (Phaser.Math.Distance.Between(x, y, head.x, head.y) <= HEAD_RADIUS * scale + reach) {
      return 'head';
    }
    const body = this.boneAt('body');
    if (Phaser.Math.Distance.Between(x, y, body.x, body.y) <= TORSO_HALF_WIDTH * scale + reach) {
      return 'body';
    }
    return null;
  }

  /**
   * Rub at a point. Returns whether a smudge came off.
   *
   * The nearest smudge within reach takes the rub, so working over one patch
   * clears that patch — spreading the rubs across whatever happens to be under
   * the tool would mean five half-cleaned spots and no sense of progress.
   */
  scrubAt(x: number, y: number, strength = 1): boolean {
    const reach = BATHING.reach * this.scale;
    let nearest: Spot | null = null;
    let best = reach;
    for (const spot of this.spots) {
      if (spot.going) continue;
      const m = spot.image.getWorldTransformMatrix();
      const d = Phaser.Math.Distance.Between(x, y, m.tx, m.ty);
      if (d < best) {
        best = d;
        nearest = spot;
      }
    }
    if (!nearest) return false;

    nearest.rubs += strength;
    // Fade as it goes, so five rubs feel like progress rather than four
    // nothings and a disappearance.
    nearest.image.setAlpha(Math.max(0.15, 1 - nearest.rubs / BATHING.rubsPerSpot));
    if (nearest.rubs < BATHING.rubsPerSpot) return false;
    this.lift(nearest);
    return true;
  }

  /**
   * Stick a clump of suds on her at a scene-space point.
   *
   * CLAMPED to her torso, because the point comes from wherever the finger was
   * and a clump placed there hangs in the air beside her — or, on a wide sweep,
   * outside the bath entirely.
   *
   * Small clumps, and not many. The first version overrode the size `makeFoam`
   * had already applied and every clump came out at 64px, which lathered her
   * into one white cloud with a face on it: charming for a second, and then the
   * player cannot see a single thing they are supposed to be scrubbing.
   */
  lather(x: number, y: number): void {
    if (this.foam.length >= BATHING.lather) return;
    const bone = this.rig.bone('body');
    const local = bone.getWorldTransformMatrix().applyInverse(x, y);
    const clump = makeFoam(this.scene, Phaser.Math.Between(28, 42))
      .setPosition(Phaser.Math.Clamp(local.x, -72, 72), Phaser.Math.Clamp(local.y, -108, 42))
      .setAngle(Phaser.Math.Between(-25, 25))
      .setAlpha(0.86);
    const full = clump.scale;
    clump.setScale(full * 0.15);
    bone.add(clump);
    this.foam.push(clump);
    this.scene.tweens.add({
      targets: clump,
      scale: full,
      duration: 220,
      ease: 'Back.easeOut',
    });
  }


  /* ------------------------------ teeth ------------------------------ */

  /**
   * Open her mouth and show what is in it.
   *
   * Laid OVER whichever mouth shape is currently visible rather than swapping
   * to the rig's own `open` shape, and that is deliberate: the mood resolver
   * owns `setMouth` and re-asserts it whenever the mood changes, so a shape
   * swap here would be silently undone the moment a stat crossed a threshold
   * mid-brush. An overlay cannot be argued with.
   */
  showTeeth(on: boolean): void {
    if (on === (this.teeth !== null)) return;
    if (!on) {
      const going = [this.teeth, this.plaque].filter((o): o is Phaser.GameObjects.Image => !!o);
      this.teeth = null;
      this.plaque = null;
      this.scene.tweens.add({
        targets: going,
        alpha: 0,
        duration: 160,
        onComplete: () => {
          for (const o of going) o.destroy();
        },
      });
      return;
    }

    const mouth = this.rig.bone('mouth');
    this.teeth = makeOpenMouth(this.scene).setAlpha(0);
    mouth.add(this.teeth);
    this.scene.tweens.add({ targets: this.teeth, alpha: 1, duration: 160 });

    if (!this.plaqueLeft) return;
    this.plaque = makePlaque(this.scene).setAlpha(0);
    mouth.add(this.plaque);
    this.scene.tweens.add({ targets: this.plaque, alpha: 1, duration: 160 });
  }

  /** Whether there is anything on her teeth worth brushing off. */
  get teethDirty(): boolean {
    return this.plaqueLeft;
  }

  /**
   * Brush the teeth. `progress` runs 0..1; at 1 the plaque is gone for good.
   *
   * The whole patch fades together rather than tooth by tooth, and that is a
   * playability call: a tooth is nine pixels across and nobody is aiming a
   * fingertip at one of those.
   */
  brushTeeth(progress: number): void {
    if (!this.plaqueLeft) return;
    const left = Phaser.Math.Clamp(1 - progress, 0, 1);
    this.plaque?.setAlpha(left);
    if (left > 0) return;

    this.plaqueLeft = false;
    this.plaque?.destroy();
    this.plaque = null;
  }

  /**
   * Wash the suds off. THE DIRT STAYS.
   *
   * The obvious version lifted the remaining smudges too, and it produced a
   * ghost: rinsing a half-scrubbed cat cleared every smudge, `setClean` ran on
   * the next refresh, saw a cleanliness that still implied four of them, and
   * put them straight back. Dirt comes off by being scrubbed off, or by
   * cleanliness climbing past the threshold — and the rinse's own top-up is
   * what does that when the player has actually earned it.
   */
  rinse(): void {
    for (const [i, clump] of this.foam.entries()) {
      this.scene.tweens.add({
        targets: clump,
        y: clump.y + 90,
        alpha: 0,
        scale: clump.scale * 0.5,
        delay: i * 24,
        duration: 520,
        ease: 'Quad.easeIn',
        onComplete: () => clump.destroy(),
      });
    }
    this.foam.length = 0;
  }

  destroy(): void {
    this.teeth?.destroy();
    this.plaque?.destroy();
    this.teeth = null;
    this.plaque = null;
    for (const spot of this.spots) spot.image.destroy();
    for (const clump of this.foam) clump.destroy();
    this.spots.length = 0;
    this.foam.length = 0;
    this.placed = 0;
  }
}

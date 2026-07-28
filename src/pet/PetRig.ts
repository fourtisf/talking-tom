/**
 * Bone/part registry and part swapping. Spec §10.
 *
 * The pet is a hierarchy of independently transformable containers, not a
 * spritesheet:
 *
 *   root -> { tail, body, armL, armR, legL, legR,
 *             head -> { earL, earR, eyeL, eyeR, mouth, blush, accessory } }
 *
 * Every part is registered under a name. `PetAnimator` only ever touches parts
 * by name, so nothing breaks when the art behind a name changes.
 */

import type Phaser from 'phaser';

import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  PLACEMENTS,
  placeholderPetArt,
  type MouthShape,
  type PartKey,
  type PetArtProvider,
} from '@/pet/PetArt';

/** Names the animator and mood resolver address. */
export type BoneKey =
  | 'root'
  | 'tail'
  | 'body'
  | 'armL'
  | 'armR'
  | 'legL'
  | 'legR'
  | 'head'
  | 'earL'
  | 'earR'
  | 'eyeL'
  | 'eyeR'
  | 'ballL'
  | 'ballR'
  | 'lidL'
  | 'lidR'
  | 'muzzle'
  | 'mouth'
  | 'blush'
  | 'accessory';

export class PetRig {
  readonly scene: Phaser.Scene;
  readonly art: PetArtProvider;

  /** Top-level container. Position and scale this, not the parts. */
  readonly root: Phaser.GameObjects.Container;

  private readonly bones = new Map<BoneKey, Phaser.GameObjects.Container>();
  private readonly mouths = new Map<MouthShape, Phaser.GameObjects.GameObject>();
  private currentMouth: MouthShape = 'norm';
  private accessoryId: string | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, art: PetArtProvider = placeholderPetArt) {
    this.scene = scene;
    this.art = art;
    this.root = scene.add.container(x, y);
    this.build();
  }

  /* ------------------------------ build ----------------------------- */

  private build(): void {
    const root = this.root;
    this.bones.set('root', root);

    // Draw order is back to front: tail, legs, body, arms, head.
    this.mountPart('tail', 'tail', root);
    this.mountPart('legL', 'legL', root);
    this.mountPart('legR', 'legR', root);
    this.mountPart('body', 'body', root);
    this.mountPart('armL', 'armL', root);
    this.mountPart('armR', 'armR', root);

    const head = this.container('head', PLACEMENTS.head.x, PLACEMENTS.head.y, root);
    head.add(this.art.createPart(this.scene, 'head'));

    // Ears sit behind the head shape so the fill overlaps their base.
    const earL = this.mountPart('earL', 'earL', head);
    const earR = this.mountPart('earR', 'earR', head);
    head.sendToBack(earR);
    head.sendToBack(earL);

    this.mountPart('blush', 'blush', head);
    this.mountPart('muzzle', 'muzzle', head);

    // Eyes: white, then the translatable ball group, then the lid on top.
    this.mountPart('eyeL', 'eyeWhiteL', head);
    this.mountPart('eyeR', 'eyeWhiteR', head);
    this.mountPart('ballL', 'eyeBallL', head);
    this.mountPart('ballR', 'eyeBallR', head);
    // Lids start fully open.
    this.mountPart('lidL', 'lidL', head).scaleY = 0;
    this.mountPart('lidR', 'lidR', head).scaleY = 0;

    head.add(this.art.createPart(this.scene, 'lashes'));
    head.add(this.positioned(this.art.createPart(this.scene, 'nose'), PLACEMENTS.nose));

    // Mouth: all four shapes live in one container, one visible at a time.
    const mouth = this.container('mouth', PLACEMENTS.muzzle.x, PLACEMENTS.muzzle.y, head);
    const shapes = this.art.createMouths(this.scene);
    for (const shape of Object.keys(shapes) as MouthShape[]) {
      const obj = shapes[shape];
      this.mouths.set(shape, obj);
      mouth.add(obj);
      this.setVisible(obj, shape === 'norm');
    }

    // Accessory anchors to a named point on the head so hats fit any head shape.
    this.container('accessory', PLACEMENTS.accessory.x, PLACEMENTS.accessory.y, head);
  }

  private container(
    name: BoneKey,
    x: number,
    y: number,
    parent: Phaser.GameObjects.Container,
  ): Phaser.GameObjects.Container {
    const c = this.scene.add.container(x, y);
    parent.add(c);
    this.bones.set(name, c);
    return c;
  }

  /** Wrap one art part in its own container so transforms never fight. */
  private mountPart(
    name: BoneKey,
    part: PartKey,
    parent: Phaser.GameObjects.Container,
    placementKey: PartKey = part,
  ): Phaser.GameObjects.Container {
    const placement = PLACEMENTS[placementKey];
    const c = this.scene.add.container(placement.x, placement.y);
    c.add(this.art.createPart(this.scene, part));
    parent.add(c);
    this.bones.set(name, c);
    return c;
  }

  private positioned(
    obj: Phaser.GameObjects.GameObject,
    at: { x: number; y: number },
  ): Phaser.GameObjects.GameObject {
    const t = obj as Phaser.GameObjects.GameObject & { x: number; y: number };
    t.x = at.x;
    t.y = at.y;
    return obj;
  }

  private setVisible(obj: Phaser.GameObjects.GameObject, visible: boolean): void {
    (obj as Phaser.GameObjects.GameObject & { visible: boolean }).visible = visible;
  }

  /* ------------------------------ access ---------------------------- */

  /** Throws for an unknown name — a typo should fail loudly, not silently. */
  bone(name: BoneKey): Phaser.GameObjects.Container {
    const c = this.bones.get(name);
    if (!c) throw new Error(`PetRig: no bone named "${name}"`);
    return c;
  }

  has(name: BoneKey): boolean {
    return this.bones.has(name);
  }

  get width(): number {
    return DESIGN_WIDTH;
  }

  get height(): number {
    return DESIGN_HEIGHT;
  }

  /* ---------------------------- expression -------------------------- */

  /** Expression is a mouth swap plus an eyelid scale. Never a body redraw. */
  setMouth(shape: MouthShape): void {
    if (this.currentMouth === shape) return;
    this.currentMouth = shape;
    for (const [key, obj] of this.mouths) {
      this.setVisible(obj, key === shape);
    }
  }

  get mouth(): MouthShape {
    return this.currentMouth;
  }

  /** The open mouth is the one the talk/eat animations scale. */
  mouthObject(shape: MouthShape): Phaser.GameObjects.GameObject | undefined {
    return this.mouths.get(shape);
  }

  /* ---------------------------- accessory --------------------------- */

  /** Equip or clear the hat slot. Art comes from the provider, never a scene. */
  setAccessory(itemId: string | null): void {
    if (this.accessoryId === itemId) return;
    this.accessoryId = itemId;

    const slot = this.bone('accessory');
    slot.removeAll(true);
    if (!itemId) return;

    const art = this.art.createAccessory(this.scene, itemId);
    if (art) slot.add(art);
  }

  get accessory(): string | null {
    return this.accessoryId;
  }

  destroy(): void {
    this.root.destroy(true);
    this.bones.clear();
    this.mouths.clear();
  }
}

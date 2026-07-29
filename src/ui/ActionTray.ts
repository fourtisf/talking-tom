/**
 * The contextual row of action buttons above the nav bar. Its contents change
 * with the room; the tray itself slides shut for rooms that have no actions.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { drawIcon, type IconName } from '@/ui/icons';
import { FONT_BODY, RADIUS } from '@/ui/theme';

export interface TrayItem {
  id: string;
  label: string;
  /** Small line under the label: a price, or a hint like "tap". */
  caption: string;
  icon: IconName;
  disabled?: boolean;
  /** Renders the caption in the gold "price" colour. */
  priced?: boolean;
}

const ITEM_WIDTH = 70;
const ITEM_HEIGHT = 74;

export class ActionTray extends Phaser.GameObjects.Container {
  private readonly trayWidth: number;
  /**
   * The tile's position goes with the id. Hand feeding lifts a morsel out of
   * the tile that was tapped, and it has to appear under the finger rather than
   * somewhere the tray happens to know about.
   */
  private readonly onPress: (id: string, at: { x: number; y: number }) => void;
  /**
   * Drag callbacks, optional. Hand feeding uses them so that pressing the fish
   * and pulling it to her mouth is ONE gesture; every other tile ignores them
   * and behaves as a plain button.
   */
  private onDragStart: ((id: string, at: { x: number; y: number }) => boolean) | null = null;
  private onDragMove: ((x: number, y: number) => void) | null = null;
  private onDragEnd: (() => void) | null = null;
  private dragging = false;
  private open = false;
  private items: Phaser.GameObjects.Container[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    onPress: (id: string, at: { x: number; y: number }) => void,
  ) {
    super(scene, x, y);
    this.trayWidth = width;
    this.onPress = onPress;
    this.setAlpha(0);
    scene.add.existing(this);
  }

  /**
   * `start` returns whether it took the drag. A tile it refuses stays a button,
   * so pressing Scrub and wobbling a finger does not arm a feeding session.
   */
  setDragHandlers(
    start: (id: string, at: { x: number; y: number }) => boolean,
    move: (x: number, y: number) => void,
    end: () => void,
  ): void {
    this.onDragStart = start;
    this.onDragMove = move;
    this.onDragEnd = end;
  }

  get isOpen(): boolean {
    return this.open;
  }

  get trayHeight(): number {
    return ITEM_HEIGHT;
  }

  /** Replace the tray contents. An empty list closes the tray. */
  show(items: readonly TrayItem[]): void {
    this.clearItems();

    if (items.length === 0) {
      this.setOpen(false);
      return;
    }

    /*
     * Shrink to fit rather than overflow.
     *
     * The row used to be a fixed 70px per item, centred — which is fine up to
     * five and silently broken at six: the kitchen gained Sushi and Feast, the
     * row went to 460px inside a 420px column, `startX` went negative, and the
     * first and last items were cut in half by the screen edges with no way to
     * scroll to them. Every item has to be reachable, so the width gives way.
     */
    const gap = 8;
    const sidePad = 10;
    const available = this.trayWidth - sidePad * 2 - gap * (items.length - 1);
    const itemWidth = Math.min(ITEM_WIDTH, available / items.length);
    const totalWidth = items.length * itemWidth + (items.length - 1) * gap;
    const startX = (this.trayWidth - totalWidth) / 2;

    items.forEach((item, i) => {
      const container = this.buildItem(item, startX + i * (itemWidth + gap), itemWidth);
      this.add(container);
      this.items.push(container);
    });

    this.setOpen(true);
  }

  private buildItem(item: TrayItem, x: number, width: number): Phaser.GameObjects.Container {
    const scene = this.scene;
    const container = scene.add.container(x, 0);
    const enabled = !item.disabled;

    const card = scene.add.graphics();
    card.fillStyle(PALETTE.white, 1);
    card.lineStyle(3, PALETTE.ink, 1);
    card.fillRoundedRect(0, 0, width, ITEM_HEIGHT, RADIUS.card);
    card.strokeRoundedRect(0, 0, width, ITEM_HEIGHT, RADIUS.card);
    // The chunky drop shadow the prototype leans on.
    card.fillStyle(PALETTE.ink, 1);
    card.fillRoundedRect(0, ITEM_HEIGHT - 2, width, 4, 2);
    container.add(card);

    const icon = drawIcon(scene, item.icon, Math.min(34, width * 0.48), PALETTE.ink2, 2.4);
    icon.setPosition(width / 2, 24);
    container.add(icon);

    container.add(
      scene.add
        .text(width / 2, 46, item.label, {
          fontFamily: FONT_BODY,
          fontSize: '9.5px',
          color: '#5b486b',
          fontStyle: 'bold',
          // Indonesian runs 15-25% longer than English, and "Prasmanan" in a
          // narrowed card is what found this. Ellipsis beats spilling over the
          // neighbouring item.
          wordWrap: { width: width - 6 },
          maxLines: 1,
        })
        .setOrigin(0.5),
    );

    container.add(
      scene.add
        .text(width / 2, 60, item.caption, {
          wordWrap: { width: width - 6 },
          maxLines: 1,
          fontFamily: FONT_BODY,
          fontSize: '11.5px',
          color: item.priced ? '#8a5a00' : '#5b486b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    container.setAlpha(enabled ? 1 : 0.4);

    if (enabled) {
      const hit = scene.add
        .rectangle(width / 2, ITEM_HEIGHT / 2, width, ITEM_HEIGHT, 0x000000, 0)
        .setInteractive({ draggable: true, useHandCursor: true });
      scene.input.setDraggable(hit);

      const tileAt = (): { x: number; y: number } => {
        const matrix = container.getWorldTransformMatrix();
        return { x: matrix.tx + width / 2, y: matrix.ty + ITEM_HEIGHT / 2 };
      };

      hit.on(Phaser.Input.Events.GAMEOBJECT_DRAG_START, () => {
        this.dragging = this.onDragStart?.(item.id, tileAt()) ?? false;
        if (this.dragging) container.y = 0;
      });
      /*
       * The POINTER's world position, not Phaser's dragX/dragY.
       *
       * Those are the dragged object's intended position in its PARENT's
       * space, and this hit rect lives inside a tile inside the tray — so
       * feeding them to a top-level object put the food 713px above the
       * finger holding it. What the food should do is follow the finger, and
       * that is what the pointer already is.
       */
      hit.on(Phaser.Input.Events.GAMEOBJECT_DRAG, (pointer: Phaser.Input.Pointer) => {
        if (this.dragging) this.onDragMove?.(pointer.worldX, pointer.worldY);
      });
      hit.on(Phaser.Input.Events.GAMEOBJECT_DRAG_END, () => {
        if (!this.dragging) return;
        this.dragging = false;
        this.onDragEnd?.();
      });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        container.y = 4;
      });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        container.y = 0;
        // A tile that has just been dragged must not also fire its tap, or a
        // feed would be paid for twice.
        if (this.dragging) return;
        this.onPress(item.id, tileAt());
      });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        container.y = 0;
      });
      container.add(hit);
    }

    return container;
  }

  private setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      alpha: open ? 1 : 0,
      duration: 220,
      ease: 'Sine.easeOut',
    });
  }

  private clearItems(): void {
    for (const item of this.items) item.destroy(true);
    this.items = [];
  }

  setInputEnabled(enabled: boolean): void {
    for (const item of this.items) {
      for (const child of item.list) {
        if (child instanceof Phaser.GameObjects.Rectangle) {
          if (enabled) child.setInteractive({ useHandCursor: true });
          else child.disableInteractive();
        }
      }
    }
  }

  override destroy(fromScene?: boolean): void {
    this.clearItems();
    super.destroy(fromScene);
  }
}

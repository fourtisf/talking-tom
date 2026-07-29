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
  private readonly onPress: (id: string) => void;
  private open = false;
  private items: Phaser.GameObjects.Container[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    onPress: (id: string) => void,
  ) {
    super(scene, x, y);
    this.trayWidth = width;
    this.onPress = onPress;
    this.setAlpha(0);
    scene.add.existing(this);
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
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        container.y = 4;
      });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        container.y = 0;
        this.onPress(item.id);
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

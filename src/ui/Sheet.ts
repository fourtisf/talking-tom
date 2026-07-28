/**
 * Bottom sheet: a dimmed backdrop plus a panel that slides up from the floor.
 *
 * Used by the shop and the offline return card. It is a component rather than a
 * scene so the pet behind it keeps breathing.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { DEPTH, FONT_BODY, FONT_DISPLAY, RADIUS } from '@/ui/theme';

export interface SheetOptions {
  title: string;
  subtitle?: string;
  /** Fraction of screen height the panel may occupy. */
  maxHeightRatio?: number;
  onClose?: () => void;
}

export class Sheet extends Phaser.GameObjects.Container {
  readonly content: Phaser.GameObjects.Container;

  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly panelBackground: Phaser.GameObjects.Graphics;
  private readonly screenWidth: number;
  private readonly screenHeight: number;
  private readonly options: SheetOptions;
  private panelHeight: number;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    screenWidth: number,
    screenHeight: number,
    options: SheetOptions,
  ) {
    super(scene, 0, 0);
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.options = options;
    this.setDepth(DEPTH.sheet).setVisible(false);

    this.backdrop = scene.add
      .rectangle(0, 0, screenWidth, screenHeight, PALETTE.ink, 0.62)
      .setOrigin(0)
      .setInteractive();
    this.backdrop.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.close());
    this.add(this.backdrop);

    this.panelHeight = screenHeight * (options.maxHeightRatio ?? 0.7);
    this.panel = scene.add.container(0, screenHeight);
    this.add(this.panel);

    this.panelBackground = scene.add.graphics();
    this.panel.add(this.panelBackground);
    this.drawPanel();

    const pad = 20;
    this.panel.add(
      scene.add
        .text(pad, 22, options.title, {
          fontFamily: FONT_DISPLAY,
          fontSize: '25px',
          color: '#33243f',
          fontStyle: 'bold',
        })
        .setOrigin(0),
    );

    if (options.subtitle) {
      this.panel.add(
        scene.add
          .text(pad, 54, options.subtitle, {
            fontFamily: FONT_BODY,
            fontSize: '12.5px',
            color: '#5b486b',
            fontStyle: 'bold',
          })
          .setOrigin(0),
      );
    }

    this.content = scene.add.container(0, options.subtitle ? 82 : 62);
    this.panel.add(this.content);

    scene.add.existing(this);
  }

  private drawPanel(): void {
    this.panelBackground.clear();
    this.panelBackground.fillStyle(PALETTE.cream, 1);
    this.panelBackground.fillRoundedRect(
      0,
      0,
      this.screenWidth,
      this.panelHeight,
      { tl: RADIUS.sheet, tr: RADIUS.sheet, bl: 0, br: 0 },
    );
    this.panelBackground.lineStyle(6, PALETTE.ink, 1);
    this.panelBackground.beginPath();
    this.panelBackground.moveTo(0, RADIUS.sheet);
    this.panelBackground.arc(
      RADIUS.sheet,
      RADIUS.sheet,
      RADIUS.sheet,
      Math.PI,
      Math.PI * 1.5,
      false,
    );
    this.panelBackground.lineTo(this.screenWidth - RADIUS.sheet, 0);
    this.panelBackground.arc(
      this.screenWidth - RADIUS.sheet,
      RADIUS.sheet,
      RADIUS.sheet,
      Math.PI * 1.5,
      0,
      false,
    );
    this.panelBackground.strokePath();
  }

  /** Grow or shrink the panel to fit its content. */
  setPanelHeight(height: number): void {
    this.panelHeight = Math.min(height, this.screenHeight * (this.options.maxHeightRatio ?? 0.7));
    this.drawPanel();
    if (this.open) this.panel.y = this.screenHeight - this.panelHeight;
  }

  get contentWidth(): number {
    return this.screenWidth;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.setVisible(true);
    this.backdrop.setAlpha(0);
    this.panel.y = this.screenHeight;

    this.scene.tweens.add({ targets: this.backdrop, alpha: 1, duration: 260 });
    this.scene.tweens.add({
      targets: this.panel,
      y: this.screenHeight - this.panelHeight,
      duration: 400,
      ease: 'Back.easeOut',
    });
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.scene.tweens.add({ targets: this.backdrop, alpha: 0, duration: 220 });
    this.scene.tweens.add({
      targets: this.panel,
      y: this.screenHeight,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.setVisible(false);
        this.options.onClose?.();
      },
    });
  }

  get isOpen(): boolean {
    return this.open;
  }
}

/**
 * The chunky offset-shadow button the prototype uses everywhere: it sits on a
 * coloured slab and presses down into it on tap.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { FONT_DISPLAY, RADIUS } from '@/ui/theme';

export type ButtonTone = 'mint' | 'coral' | 'gold' | 'grape';

const TONES: Readonly<Record<ButtonTone, { face: number; shadow: number; text: string }>> = {
  mint: { face: PALETTE.mint, shadow: PALETTE.mintLo, text: '#ffffff' },
  coral: { face: PALETTE.coral, shadow: PALETTE.coralLo, text: '#ffffff' },
  gold: { face: PALETTE.butter, shadow: PALETTE.butterLo, text: '#6b4a0e' },
  grape: { face: PALETTE.grape, shadow: PALETTE.grapeLo, text: '#ffffff' },
};

export interface ButtonOptions {
  width: number;
  height?: number;
  tone?: ButtonTone;
  fontSize?: string;
  onPress: () => void;
}

export class Button extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hit: Phaser.GameObjects.Rectangle;
  private readonly options: Required<Omit<ButtonOptions, 'onPress'>> & { onPress: () => void };
  private pressed = false;
  private enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, options: ButtonOptions) {
    super(scene, x, y);
    this.options = {
      width: options.width,
      height: options.height ?? 50,
      tone: options.tone ?? 'mint',
      fontSize: options.fontSize ?? '17px',
      onPress: options.onPress,
    };

    const tone = TONES[this.options.tone];
    const { width, height } = this.options;

    const shadow = scene.add.graphics();
    shadow.fillStyle(tone.shadow, 1);
    shadow.fillRoundedRect(0, 5, width, height, RADIUS.button);
    this.add(shadow);

    this.face = scene.add.graphics();
    this.face.fillStyle(tone.face, 1);
    this.face.fillRoundedRect(0, 0, width, height, RADIUS.button);
    this.add(this.face);

    this.label = scene.add
      .text(width / 2, height / 2, text, {
        fontFamily: FONT_DISPLAY,
        fontSize: this.options.fontSize,
        color: tone.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add(this.label);

    this.hit = scene.add
      .rectangle(width / 2, height / 2, width, height + 5, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    this.hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.setPressed(true));
    this.hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.setPressed(false));
    this.hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.pressed || !this.enabled) {
        this.setPressed(false);
        return;
      }
      this.setPressed(false);
      this.options.onPress();
    });
    this.add(this.hit);

    scene.add.existing(this);
  }

  private setPressed(pressed: boolean): void {
    if (!this.enabled) return;
    this.pressed = pressed;
    const dy = pressed ? 5 : 0;
    this.face.y = dy;
    this.label.y = this.options.height / 2 + dy;
  }

  setText(text: string): void {
    this.label.setText(text);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    if (enabled) this.hit.setInteractive({ useHandCursor: true });
    else this.hit.disableInteractive();
  }
}

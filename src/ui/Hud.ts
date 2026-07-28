/**
 * Top bar: level badge, xp bar, coin and gem purses.
 *
 * Reads nothing directly — the owning scene pushes values in, so the HUD has no
 * opinion about where a coin came from.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { bakeArt } from '@/ui/bake';
import { drawIcon } from '@/ui/icons';
import { DEPTH, FONT_DISPLAY } from '@/ui/theme';

/** The frosted pill behind the level badge and each purse. */
function paintGlassPill(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  g.fillStyle(PALETTE.ink, 0.58);
  g.fillRoundedRect(x, y, width, height, height / 2);
  g.lineStyle(2, PALETTE.white, 0.22);
  g.strokeRoundedRect(x, y, width, height, height / 2);
}

export class Hud extends Phaser.GameObjects.Container {
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly xpFill: Phaser.GameObjects.Graphics;
  private readonly coinText: Phaser.GameObjects.Text;
  private readonly gemText: Phaser.GameObjects.Text;

  static readonly XP_BAR_WIDTH = 62;

  constructor(scene: Phaser.Scene, x: number, y: number, screenWidth: number, pad: number) {
    super(scene, x, y);
    this.setDepth(DEPTH.topBar);
    this.setScrollFactor(0);

    /* ----- level badge + xp bar ----- */
    const badgeR = 17;
    const purseW = 86;
    const purseH = 36;
    const gemX = screenWidth - pad * 2 - purseW;
    const coinX = gemX - purseW - 7;

    // All the static chrome — three pills, the level badge, the two currency
    // chips and the xp track — is one baked quad rather than nine Graphics
    // re-tessellated every frame.
    this.add(
      bakeArt(
        scene,
        `hud:${screenWidth}:${pad}`,
        { left: -4, top: -4, right: screenWidth, bottom: 48 },
        (g) => {
          paintGlassPill(g, 0, 0, 118, 42);
          paintGlassPill(g, coinX, 3, purseW, purseH);
          paintGlassPill(g, gemX, 3, purseW, purseH);

          g.fillStyle(PALETTE.butter, 1);
          g.fillCircle(4 + badgeR, 21, badgeR);
          g.lineStyle(2.5, PALETTE.butterLo, 1);
          g.strokeCircle(4 + badgeR, 21, badgeR);

          g.fillStyle(PALETTE.butter, 1);
          g.fillCircle(coinX + 17, 21, 12);
          g.fillStyle(0x4fc3e8, 1);
          g.fillCircle(gemX + 17, 21, 12);

          g.fillStyle(PALETTE.black, 0.34);
          g.fillRoundedRect(4 + badgeR * 2 + 8, 17, Hud.XP_BAR_WIDTH, 8, 4);
        },
      ),
    );

    this.levelText = scene.add
      .text(4 + badgeR, 21, '1', {
        fontFamily: FONT_DISPLAY,
        fontSize: '17px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#46356b', 4);
    this.add(this.levelText);

    const xpX = 4 + badgeR * 2 + 8;
    this.xpFill = scene.add.graphics();
    this.add(this.xpFill);
    this.xpFill.setData('x', xpX);

    /* ----- purses ----- */
    const coinIcon = drawIcon(scene, 'coin', 16, 0x6b4a0e);
    coinIcon.setPosition(coinX + 17, 21);
    this.add(coinIcon);

    const gemIcon = drawIcon(scene, 'gem', 15, 0x0b4a5e);
    gemIcon.setPosition(gemX + 17, 21);
    this.add(gemIcon);

    this.coinText = scene.add
      .text(coinX + 34, 21, '0', {
        fontFamily: FONT_DISPLAY,
        fontSize: '17px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5)
      .setStroke('#46356b', 4);
    this.add(this.coinText);

    this.gemText = scene.add
      .text(gemX + 34, 21, '0', {
        fontFamily: FONT_DISPLAY,
        fontSize: '17px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5)
      .setStroke('#46356b', 4);
    this.add(this.gemText);

    scene.add.existing(this);
    this.setCurrency(0, 0);
    this.setProgress(1, 0);
  }

  setCurrency(coins: number, gems: number): void {
    this.bumpIfChanged(this.coinText, Math.floor(coins).toString());
    this.bumpIfChanged(this.gemText, Math.floor(gems).toString());
  }

  /** `progress` is 0..1 through the current level. */
  setProgress(level: number, progress: number): void {
    this.levelText.setText(level.toString());
    const x = (this.xpFill.getData('x') as number) ?? 0;
    const width = Hud.XP_BAR_WIDTH * Phaser.Math.Clamp(progress, 0, 1);
    this.xpFill.clear();
    if (width < 1) return;
    this.xpFill.fillStyle(PALETTE.mint, 1);
    this.xpFill.fillRoundedRect(x, 17, width, 8, Math.min(4, width / 2));
  }

  /** A tiny pop so a coin change is felt, not just read. */
  private bumpIfChanged(text: Phaser.GameObjects.Text, next: string): void {
    if (text.text === next) return;
    text.setText(next);
    this.scene.tweens.add({
      targets: text,
      scale: { from: 1.25, to: 1 },
      duration: 220,
      ease: 'Back.easeOut',
    });
  }
}

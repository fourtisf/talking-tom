/**
 * Fish-catching mini-game. Spec §7 / §9.
 *
 * Launched *over* HomeScene so the pet is never unloaded. Fish are worth a
 * catch each; socks cost three. Every payout goes through `Economy` and
 * `Progression` — this scene owns no numbers of its own.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { EARN, MINIGAME } from '@/config/tuning';
import { GameContext } from '@/core/GameContext';
import { Button } from '@/ui/Button';
import { drawIcon } from '@/ui/icons';
import { FONT_DISPLAY } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';

interface FallingItem {
  container: Phaser.GameObjects.Container;
  tween: Phaser.Tweens.Tween;
  isJunk: boolean;
  caught: boolean;
}

export class MiniGameScene extends Phaser.Scene {
  private context!: GameContext;
  private score = 0;
  private secondsLeft = MINIGAME.durationSeconds;
  private items = new Set<FallingItem>();

  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private tickTimer: Phaser.Time.TimerEvent | null = null;
  private spawnTimer: Phaser.Time.TimerEvent | null = null;
  private over = false;

  constructor() {
    super(SCENE.miniGame);
  }

  create(): void {
    this.context = GameContext.from(this);
    const { width, height } = this.scale.gameSize;

    // Phaser reuses the scene instance across stop/launch, so every piece of
    // round state is reset here rather than in a field initialiser.
    this.score = 0;
    this.secondsLeft = MINIGAME.durationSeconds;
    this.over = false;
    this.items.clear();

    const sky = this.add.graphics();
    sky.fillGradientStyle(0x7fd8f5, 0x7fd8f5, 0x3e9fcb, 0x3e9fcb, 1);
    sky.fillRect(0, 0, width, height);

    const wave = this.add.graphics();
    wave.fillStyle(0x2e85ae, 1);
    wave.fillRect(0, height * 0.78, width, height * 0.22);
    wave.fillStyle(PALETTE.ink, 1);
    wave.fillRect(0, height * 0.78, width, 6);

    this.scoreText = this.add
      .text(16, 22, '0 caught', {
        fontFamily: FONT_DISPLAY,
        fontSize: '21px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setStroke('#46356b', 5);

    this.timeText = this.add
      .text(width - 16, 22, `${MINIGAME.durationSeconds}s`, {
        fontFamily: FONT_DISPLAY,
        fontSize: '21px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setStroke('#46356b', 5);

    this.tickTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.onSecond(),
    });
    this.spawnTimer = this.time.addEvent({
      delay: MINIGAME.spawnIntervalMs,
      loop: true,
      callback: () => this.spawn(),
    });
  }

  private onSecond(): void {
    this.secondsLeft -= 1;
    this.timeText.setText(`${Math.max(0, this.secondsLeft)}s`);
    if (this.secondsLeft <= 0) this.endRound();
  }

  private spawn(): void {
    if (this.over) return;

    const { width, height } = this.scale.gameSize;
    const isJunk = Math.random() < MINIGAME.junkChance;
    const size = 56;

    const container = this.add.container(
      Phaser.Math.Between(Math.floor(width * 0.08), Math.floor(width * 0.92)),
      -size,
    );
    const icon = drawIcon(this, isJunk ? 'sock' : 'fish', size, PALETTE.white, 2.6);
    container.add(icon);

    const hit = this.add
      .rectangle(0, 0, size + 16, size + 16, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    container.add(hit);

    const item: FallingItem = {
      container,
      isJunk,
      caught: false,
      tween: this.tweens.add({
        targets: container,
        y: height + size,
        angle: 200,
        duration: Phaser.Math.Between(MINIGAME.fallDurationMsMin, MINIGAME.fallDurationMsMax),
        ease: 'Linear',
        onComplete: () => this.remove(item),
      }),
    };
    this.items.add(item);

    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.onCatch(item));
  }

  private onCatch(item: FallingItem): void {
    if (item.caught || this.over) return;
    item.caught = true;

    if (item.isJunk) {
      this.score = Math.max(0, this.score - MINIGAME.junkScorePenalty);
      this.context.audio.play('denied');
    } else {
      this.score += 1;
      this.context.audio.play('coin');
    }
    this.scoreText.setText(`${this.score} caught`);

    item.tween.stop();
    this.tweens.add({
      targets: item.container,
      scale: 1.9,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => this.remove(item),
    });
  }

  private remove(item: FallingItem): void {
    if (!this.items.has(item)) return;
    this.items.delete(item);
    item.container.destroy(true);
  }

  private endRound(): void {
    if (this.over) return;
    this.over = true;

    this.tickTimer?.remove();
    this.spawnTimer?.remove();
    for (const item of [...this.items]) {
      item.tween.stop();
      this.remove(item);
    }

    const { state, economy, progression } = this.context;
    const coins = this.score * EARN.miniGameCoinsPerCatch;
    const fun = Math.min(MINIGAME.funCap, this.score * MINIGAME.funPerCatch);

    economy.earn(coins, 'minigame');
    state.addStat('fun', fun);
    state.addStat('energy', -MINIGAME.energyCost);
    if (this.score > 0) progression.award('miniGameCatch', this.score);

    this.showResults(coins, fun);
  }

  private showResults(coins: number, fun: number): void {
    const { width, height } = this.scale.gameSize;

    // Interactive so a stray tap cannot fall through to a fish underneath.
    this.add.rectangle(0, 0, width, height, PALETTE.ink, 0.74).setOrigin(0).setInteractive();

    const panel = this.add.container(width / 2, height / 2);
    panel.add(
      this.add
        .text(0, -80, 'Nice catch!', {
          fontFamily: FONT_DISPLAY,
          fontSize: '36px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(0, -24, `${this.score} caught  ·  +${coins} coins  ·  +${fun} fun`, {
          fontFamily: FONT_DISPLAY,
          fontSize: '15px',
          color: '#ffffff',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: width - 60 },
        })
        .setOrigin(0.5),
    );

    const buttonWidth = 200;
    panel.add(
      new Button(this, -buttonWidth / 2, 24, 'Collect', {
        width: buttonWidth,
        tone: 'gold',
        onPress: () => this.close(),
      }),
    );

    this.tweens.add({
      targets: panel,
      scale: { from: 0.8, to: 1 },
      duration: 320,
      ease: 'Back.easeOut',
    });
  }

  private close(): void {
    this.scene.get(SCENE.home).events.emit('minigame-closed');
    this.scene.stop();
  }
}

/**
 * Copycat — the second mini-game, gated behind `UNLOCK_LEVEL.secondMiniGame`.
 *
 * Biskit lights a sequence of pads; you play it back. One step longer each
 * round. Launched *over* HomeScene like Catch is, so the pet never unloads.
 *
 * WHY MEMORY AND NOT ANOTHER REFLEX GAME. Catch is "hit the moving thing", and
 * a reskin of it would have been a second thing to be bored of rather than a
 * second thing to do. This one also inverts the hook the whole game is sold on
 * — she repeats you everywhere else, so here you repeat her — and it needs no
 * instructions, which matters when the tutorial has already spent the player's
 * patience.
 *
 * Every payout goes through `Economy` and `Progression`; this scene owns no
 * numbers of its own.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { MINIGAME_COPYCAT } from '@/config/tuning';
import { GameContext } from '@/core/GameContext';
import { Button } from '@/ui/Button';
import { FONT_DISPLAY, RADIUS, uiColumn } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';
import { analytics } from '@/services/Analytics';

interface Pad {
  readonly index: number;
  readonly face: Phaser.GameObjects.Graphics;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly hit: Phaser.GameObjects.Rectangle;
}

/**
 * One colour and one pitch per pad. The pitches are a major triad plus the
 * octave, so a wrong recall sounds wrong before the screen says so — which is
 * the feedback that makes a memory game feel fair rather than arbitrary.
 */
const PAD_TONE = [392, 523.25, 659.25, 784] as const;
const PAD_COLOUR = [PALETTE.coral, PALETTE.butter, PALETTE.mint, PALETTE.sky] as const;

export class CopycatScene extends Phaser.Scene {
  private context!: GameContext;

  private pads: Pad[] = [];
  private sequence: number[] = [];
  private awaiting = 0;
  private round = 1;
  /** Correct steps across the WHOLE session — what everything is paid on. */
  private steps = 0;

  private headline!: Phaser.GameObjects.Text;
  private subline!: Phaser.GameObjects.Text;

  private playbackEvents: Phaser.Time.TimerEvent[] = [];
  private stepTimer: Phaser.Time.TimerEvent | null = null;
  private acceptingInput = false;
  private over = false;

  constructor() {
    super(SCENE.copycat);
  }

  create(): void {
    this.context = GameContext.from(this);
    const { width, height } = this.scale.gameSize;

    // Phaser reuses the scene instance across stop/launch, so every piece of
    // round state is reset here rather than in a field initialiser.
    this.sequence = [];
    this.pads = [];
    this.playbackEvents = [];
    this.awaiting = 0;
    this.round = 1;
    this.steps = 0;
    this.acceptingInput = false;
    this.over = false;

    const backdrop = this.add.graphics();
    backdrop.fillGradientStyle(0x5b3f8f, 0x5b3f8f, 0x2e2247, 0x2e2247, 1);
    backdrop.fillRect(0, 0, width, height);

    this.headline = this.add
      .text(width / 2, 96, 'Watch', {
        fontFamily: FONT_DISPLAY,
        fontSize: '34px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setStroke('#2b2040', 6);

    this.subline = this.add
      .text(width / 2, 138, `Round ${this.round}`, {
        fontFamily: FONT_DISPLAY,
        fontSize: '17px',
        color: '#e6d9ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.buildPads(width, height);
    this.nextRound();
  }

  /* ------------------------------ board ------------------------------ */

  private buildPads(width: number, height: number): void {
    // Confined to the control column so a wide screen does not spread the pads
    // to the corners of a monitor — same reason Catch confines its spawns.
    const column = uiColumn(width);
    const gap = 14;
    const sideMargin = 22;
    // Fill the space rather than sitting in the top corner: sized against BOTH
    // axes and then centred in what is left under the header. The first version
    // divided the column by two gaps it did not have and pinned the top edge at
    // a constant, which left 278px of dead purple under the board on a phone.
    const headerBottom = 170;
    const footerMargin = 40;
    const size = Math.min(
      (column.width - sideMargin * 2 - gap) / 2,
      (height - headerBottom - footerMargin - gap) / 2,
    );
    const boardHeight = size * 2 + gap;
    const originX = column.left + (column.width - (size * 2 + gap)) / 2;
    const originY = headerBottom + (height - headerBottom - footerMargin - boardHeight) / 2;

    for (let index = 0; index < MINIGAME_COPYCAT.padCount; index++) {
      const x = originX + (index % 2) * (size + gap);
      const y = originY + Math.floor(index / 2) * (size + gap);
      const colour = PAD_COLOUR[index] ?? PALETTE.grape;

      const face = this.add.graphics();
      face.fillStyle(PALETTE.ink, 1);
      face.fillRoundedRect(x, y + 6, size, size, RADIUS.card);
      face.fillStyle(colour, 1);
      face.fillRoundedRect(x, y, size, size, RADIUS.card);
      face.setAlpha(0.62);

      // The lit state is a SEPARATE object faded in and out, not a redraw.
      // Redrawing a Graphics re-tessellates it, and this happens on every beat.
      const glow = this.add.graphics();
      glow.fillStyle(PALETTE.white, 0.55);
      glow.fillRoundedRect(x, y, size, size, RADIUS.card);
      glow.lineStyle(6, PALETTE.white, 0.9);
      glow.strokeRoundedRect(x, y, size, size, RADIUS.card);
      glow.setAlpha(0);

      const hit = this.add
        .rectangle(x + size / 2, y + size / 2, size, size, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.onPadPressed(index));

      this.pads.push({ index, face, glow, hit });
    }
  }

  private lightPad(index: number, silent = false): void {
    const pad = this.pads[index];
    if (!pad) return;

    if (!silent) this.context.audio.tone(PAD_TONE[index] ?? 440, MINIGAME_COPYCAT.litMs / 1000);

    this.tweens.killTweensOf(pad.glow);
    pad.glow.setAlpha(1);
    this.tweens.add({
      targets: pad.glow,
      alpha: 0,
      duration: MINIGAME_COPYCAT.litMs,
      ease: 'Quad.easeOut',
    });
  }

  /* ------------------------------ rounds ----------------------------- */

  private nextRound(): void {
    if (this.over) return;

    // Grow by one rather than redrawing: the player has memorised the prefix,
    // and a fresh sequence each round would throw that away every time.
    const target =
      this.round === 1
        ? MINIGAME_COPYCAT.startLength
        : this.sequence.length + 1;
    while (this.sequence.length < target) {
      this.sequence.push(Phaser.Math.Between(0, MINIGAME_COPYCAT.padCount - 1));
    }

    this.awaiting = 0;
    this.acceptingInput = false;
    this.headline.setText('Watch');
    this.subline.setText(`Round ${this.round}  ·  ${this.sequence.length} steps`);
    this.setPadsInteractive(false);

    this.playSequence();
  }

  private playSequence(): void {
    this.clearPlayback();

    const beat = MINIGAME_COPYCAT.litMs + MINIGAME_COPYCAT.gapMs;
    this.sequence.forEach((padIndex, i) => {
      this.playbackEvents.push(
        this.time.delayedCall(MINIGAME_COPYCAT.leadInMs + i * beat, () => this.lightPad(padIndex)),
      );
    });

    this.playbackEvents.push(
      this.time.delayedCall(
        MINIGAME_COPYCAT.leadInMs + this.sequence.length * beat,
        () => this.beginRecall(),
      ),
    );
  }

  private beginRecall(): void {
    if (this.over) return;
    this.acceptingInput = true;
    this.setPadsInteractive(true);
    this.headline.setText('Your turn');
    this.armStepTimer();
  }

  /**
   * A round the player has walked away from must end, or the scene sits there
   * forever holding the pet hostage behind an overlay.
   */
  private armStepTimer(): void {
    this.stepTimer?.remove();
    this.stepTimer = this.time.delayedCall(MINIGAME_COPYCAT.stepTimeoutMs, () =>
      this.endRound('Too slow!'),
    );
  }

  private onPadPressed(index: number): void {
    if (!this.acceptingInput || this.over) return;

    this.lightPad(index);

    if (this.sequence[this.awaiting] !== index) {
      this.context.audio.play('denied');
      this.endRound('Not that one');
      return;
    }

    this.awaiting += 1;
    this.steps += 1;

    if (this.awaiting < this.sequence.length) {
      this.armStepTimer();
      return;
    }

    // Round cleared.
    this.stepTimer?.remove();
    this.stepTimer = null;
    this.acceptingInput = false;
    this.setPadsInteractive(false);
    this.context.audio.play('coin');
    this.round += 1;

    if (this.round > MINIGAME_COPYCAT.maxRounds) {
      this.endRound('Perfect run!');
      return;
    }

    this.headline.setText('Nice');
    this.time.delayedCall(MINIGAME_COPYCAT.gapMs * 3, () => this.nextRound());
  }

  private setPadsInteractive(on: boolean): void {
    for (const pad of this.pads) {
      if (on) pad.hit.setInteractive({ useHandCursor: true });
      else pad.hit.disableInteractive();
    }
  }

  private clearPlayback(): void {
    for (const event of this.playbackEvents) event.remove();
    this.playbackEvents = [];
  }

  /* ------------------------------ payout ----------------------------- */

  private endRound(reason: string): void {
    if (this.over) return;
    this.over = true;

    this.clearPlayback();
    this.stepTimer?.remove();
    this.stepTimer = null;
    this.acceptingInput = false;
    this.setPadsInteractive(false);

    const { state, economy, progression } = this.context;
    const coins = this.steps * MINIGAME_COPYCAT.coinsPerStep;
    const fun = Math.min(MINIGAME_COPYCAT.funCap, this.steps * MINIGAME_COPYCAT.funPerStep);

    economy.earn(coins, 'minigame');
    state.addStat('fun', fun);
    state.addStat('energy', -MINIGAME_COPYCAT.energyCost);
    // One award for the whole session with the step count as the multiplier,
    // so a task counting steps gets the count rather than a string of ones.
    if (this.steps > 0) progression.award('miniGameCopycat', this.steps);
    analytics.track('minigame_ended', {
      game: 'copycat',
      score: this.steps,
      round: this.round,
      coins,
      level: state.level,
    });

    this.showResults(reason, coins, fun);
  }

  private showResults(reason: string, coins: number, fun: number): void {
    const { width, height } = this.scale.gameSize;

    // Interactive so a stray tap cannot fall through to a pad underneath.
    this.add.rectangle(0, 0, width, height, PALETTE.ink, 0.74).setOrigin(0).setInteractive();

    const panel = this.add.container(width / 2, height / 2);
    panel.add(
      this.add
        .text(0, -80, reason, {
          fontFamily: FONT_DISPLAY,
          fontSize: '36px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(0, -24, `${this.steps} steps  ·  +${coins} coins  ·  +${fun} fun`, {
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

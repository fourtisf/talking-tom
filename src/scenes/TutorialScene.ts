/**
 * First-run tutorial.
 *
 * Five cards, each dimming the screen except for one ring of it and saying what
 * that thing is for. It runs over `HomeScene` so the player is looking at the
 * real game the whole way through, not at a slideshow of it.
 *
 * Deliberately not interactive: it does not wait for the player to perform each
 * action, because a tutorial that blocks until you tap the right pixel is worse
 * than one you can read and dismiss. It teaches where things are; the daily
 * tasks then say what to do with them.
 *
 * `state.tutorialStep` persists the position, so a player who closes the app
 * halfway through resumes rather than starting over — and once finished or
 * skipped it is set to -1 and never runs again.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { TUTORIAL } from '@/config/tuning';
import { GameContext } from '@/core/GameContext';
import { DEPTH, FONT_BODY, FONT_DISPLAY, RADIUS, uiColumn } from '@/ui/theme';
import { SCENE } from '@/scenes/keys';

/** The measurements a step needs to find what it is pointing at. */
interface Layout {
  readonly width: number;
  readonly height: number;
  /** Left edge and width of the centred control column. */
  readonly ui: { left: number; width: number };
  /** Y of the dock's top edge — the controls hang off this. */
  readonly dockTop: number;
}

/**
 * A rounded RECTANGLE, centred on (x, y).
 *
 * Not a circle: one big enough to cover a 600px meter row is 300px tall and
 * swallows the pet and half the room with it. Not an ellipse either: its curve
 * cuts the corners off, so the outermost nav tabs stay dimmed while the middle
 * three are lit. A rounded rect frames a row exactly, and with a large enough
 * corner radius it still reads as a soft spotlight around the pet.
 */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Corner radius. Half the shorter side gives a stadium or a circle. */
  readonly r: number;
}

interface Step {
  readonly title: string;
  readonly body: string;
  /**
   * Computed, not constant. The canvas is 420 wide on a phone and up to 1560 on
   * a desktop, so a hard-coded x lands in the middle of the floor on one of
   * them. Return null for a step that dims everything.
   */
  readonly spot: (l: Layout) => Spot | null;
  /** Where the card sits, so it never covers what it is pointing at. */
  readonly cardAt: 'top' | 'bottom';
}

/** Mirrors HomeScene's own layout; see `buildDock` and `buildSideButtons`. */
const STEPS: readonly Step[] = [
  {
    title: 'This is Biskit',
    body: 'She is yours to look after. Tap her any time for a fuss — she likes that, and it tops up her Fun.',
    spot: (l) => ({ x: l.width / 2, y: l.dockTop * 0.62, w: 350, h: 400, r: 175 }),
    cardAt: 'bottom',
  },
  {
    title: 'Watch her four meters',
    body: 'Hunger, Energy, Fun and Clean. They fall slowly, even while the app is closed. Keep them up and she stays happy.',
    spot: (l) => ({ x: l.width / 2, y: l.dockTop + 46, w: l.ui.width, h: 88, r: 26 }),
    cardAt: 'top',
  },
  {
    title: 'Everything lives down here',
    body: 'Food fills her up, Bath cleans her, Sleep refills her Energy, and Play is a quick catching game for coins.',
    spot: (l) => ({ x: l.width / 2, y: l.dockTop + 151, w: l.ui.width, h: 180, r: 30 }),
    cardAt: 'top',
  },
  {
    title: 'Tasks tell you what to do',
    body: 'Three every day. Each one names a job, pays coins, and gives the XP that levels you up. Tap the list any time.',
    spot: (l) => ({ x: l.ui.left + l.ui.width - 40, y: 100, w: 100, h: 100, r: 50 }),
    cardAt: 'bottom',
  },
  {
    title: 'That is all of it',
    body: 'Look after her, finish your tasks, spend the coins on hats. Your first task is waiting — go and get it.',
    spot: () => null,
    cardAt: 'bottom',
  },
];

export class TutorialScene extends Phaser.Scene {
  private context!: GameContext;
  private index = 0;

  private shade!: Phaser.GameObjects.Graphics;
  /** Off-display geometry that the shade's inverted mask is cut from. */
  private hole!: Phaser.GameObjects.Graphics;
  /** The spotlight's edge. Separate, or the mask would eat half the stroke. */
  private ring!: Phaser.GameObjects.Graphics;
  private card!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private nextLabel!: Phaser.GameObjects.Text;
  private dots: Phaser.GameObjects.Arc[] = [];
  private layout!: Layout;

  constructor() {
    super(SCENE.tutorial);
  }

  create(): void {
    this.context = GameContext.from(this);
    const saved = this.context.state.tutorialStep;
    this.index = saved >= 0 && saved < STEPS.length ? saved : 0;

    const { width, height } = this.scale.gameSize;
    // 232 is HomeScene's dock height; the controls are all measured off it.
    this.layout = { width, height, ui: uiColumn(width), dockTop: height - 232 };

    this.shade = this.add.graphics().setDepth(DEPTH.sheet);

    // A hole has to be a mask. `fillRect` then `fillCircle` are two immediate
    // fills, not a path with a counter-wound subpath, so the circle would paint
    // OVER the dim rather than cut through it. An inverted geometry mask cuts.
    this.hole = this.make.graphics({}, false);
    const mask = this.hole.createGeometryMask();
    mask.invertAlpha = true;
    this.shade.setMask(mask);

    this.ring = this.add.graphics().setDepth(DEPTH.sheet);

    this.buildCard(width, height);

    // Anywhere on the shade advances, so a player who taps the screen rather
    // than the button is not stuck.
    const swallow = this.add
      .rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0)
      .setDepth(DEPTH.sheet - 1)
      .setInteractive();
    swallow.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.advance());

    this.card.setAlpha(0);
    this.shade.setAlpha(0);
    this.ring.setAlpha(0);
    this.time.delayedCall(TUTORIAL.startDelayMs, () => {
      this.tweens.add({ targets: [this.shade, this.ring, this.card], alpha: 1, duration: 260 });
    });

    this.paint();
  }

  private buildCard(width: number, height: number): void {
    void width;
    // In the control column. A card stretched across a 1560px canvas is a
    // letterbox strip with two words floating in it.
    const pad = 22;
    const cardWidth = this.layout.ui.width - pad * 2;

    this.card = this.add
      .container(this.layout.ui.left + pad, 0)
      .setDepth(DEPTH.sheet + 1);

    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.white, 1);
    bg.lineStyle(3.5, PALETTE.ink, 1);
    bg.fillRoundedRect(0, 0, cardWidth, 178, RADIUS.card);
    bg.strokeRoundedRect(0, 0, cardWidth, 178, RADIUS.card);
    this.card.add(bg);

    this.titleText = this.add
      .text(22, 26, '', {
        fontFamily: FONT_DISPLAY,
        fontSize: '19px',
        color: '#33243f',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);
    this.card.add(this.titleText);

    this.bodyText = this.add
      .text(22, 58, '', {
        fontFamily: FONT_BODY,
        fontSize: '13.5px',
        color: '#6b5b7f',
        lineSpacing: 5,
        wordWrap: { width: cardWidth - 44 },
      })
      .setOrigin(0, 0);
    this.card.add(this.bodyText);

    /* ---- step dots ---- */
    const dotY = 148;
    this.dots = STEPS.map((_, i) => {
      const dot = this.add.circle(24 + i * 15, dotY, 4, PALETTE.grape, 0.3);
      this.card.add(dot);
      return dot;
    });

    /* ---- next ---- */
    const next = this.add.container(cardWidth - 78, dotY);
    const chip = this.add.graphics();
    chip.fillStyle(PALETTE.mint, 1);
    chip.lineStyle(2.5, PALETTE.ink, 1);
    chip.fillRoundedRect(-52, -17, 104, 34, 17);
    chip.strokeRoundedRect(-52, -17, 104, 34, 17);
    next.add(chip);
    this.nextLabel = this.add
      .text(0, 0, 'NEXT', {
        fontFamily: FONT_DISPLAY,
        fontSize: '13.5px',
        color: '#14331f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    next.add(this.nextLabel);
    const nextHit = this.add.rectangle(0, 0, 104, 40, 0x000000, 0).setInteractive({
      useHandCursor: true,
    });
    nextHit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.advance());
    next.add(nextHit);
    this.card.add(next);

    /* ---- skip ---- */
    const skip = this.add
      .text(cardWidth - 22, -18, 'Skip', {
        fontFamily: FONT_BODY,
        fontSize: '12.5px',
        color: '#efe6fb',
        fontStyle: 'bold',
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true });
    skip.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.finish());
    this.card.add(skip);

    // Parked off-screen until `paint` places it for the current step.
    this.card.setY(height);
  }

  /** Draw the shade with a hole in it, and move the card clear of that hole. */
  private paint(): void {
    const step = STEPS[this.index];
    if (!step) return this.finish();

    const { width, height } = this.scale.gameSize;

    const spot = step.spot(this.layout);

    this.hole.clear();
    if (spot) {
      this.hole.fillStyle(0xffffff, 1);
      this.hole.fillRoundedRect(spot.x - spot.w / 2, spot.y - spot.h / 2, spot.w, spot.h, spot.r);
    }

    this.shade.clear();
    this.shade.fillStyle(PALETTE.ink, 0.74);
    this.shade.fillRect(0, 0, width, height);

    // Unmasked, so the cut gets a full-weight edge and reads as a spotlight
    // rather than as a rendering fault.
    this.ring.clear();
    if (spot) {
      this.ring.lineStyle(3, PALETTE.mint, 0.85);
      this.ring.strokeRoundedRect(
        spot.x - spot.w / 2,
        spot.y - spot.h / 2,
        spot.w,
        spot.h,
        spot.r,
      );
    }

    this.titleText.setText(step.title);
    this.bodyText.setText(step.body);
    this.nextLabel.setText(this.index === STEPS.length - 1 ? 'PLAY' : 'NEXT');
    this.dots.forEach((dot, i) => dot.setFillStyle(PALETTE.grape, i === this.index ? 1 : 0.3));

    const targetY = step.cardAt === 'top' ? 96 : height - 178 - 118;
    this.tweens.add({
      targets: this.card,
      y: targetY,
      duration: TUTORIAL.moveMs,
      ease: 'Cubic.easeOut',
    });
  }

  private advance(): void {
    this.context.audio.play('tap');
    this.index += 1;
    if (this.index >= STEPS.length) return this.finish();
    this.context.state.setTutorialStep(this.index);
    this.paint();
  }

  private finish(): void {
    this.context.state.setTutorialStep(-1);
    this.tweens.add({
      targets: [this.shade, this.ring, this.card],
      alpha: 0,
      duration: 220,
      onComplete: () => {
        this.scene.get(SCENE.home).events.emit('tutorial-finished');
        this.scene.stop();
      },
    });
  }
}

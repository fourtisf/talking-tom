/**
 * The persistent room and pet. Spec §9.
 *
 * Rooms are LAYERS in this one scene — the pet is created once and never
 * unloads, resets or re-enters while the player moves around. The shop and the
 * mini-game are launched *over* this scene for the same reason.
 *
 * This file owns presentation and input routing only. Every rule it applies
 * comes from `tuning.ts` through the core systems; there are no balance numbers
 * below this comment.
 */

import Phaser from 'phaser';

import { BACKDROP, NIGHT_TINT, PALETTE } from '@/config/palette';
import {
  FEED_CLEAN_PENALTY,
  FOODS,
  PET_FUN_GAIN,
  EARN,
  SCRUB_CLEAN_GAIN,
  STAT_WARN_BELOW,
  UNLOCK_LEVEL,
  VOICE_FUN_GAIN,
  type FoodDef,
} from '@/config/tuning';
import { DailyLogin } from '@/core/DailyLogin';
import { GameContext } from '@/core/GameContext';
import { levelProgress } from '@/core/Progression';
import { STAT_KEYS, type OfflineReport, type RoomKey, type StatKey } from '@/core/types';
import { IdleDirector } from '@/pet/IdleDirector';
import { MoodResolver } from '@/pet/MoodResolver';
import { PetAnimator } from '@/pet/PetAnimator';
import { PetRig } from '@/pet/PetRig';
import { DESIGN_HEIGHT } from '@/pet/PetArt';
import { adResultMessage } from '@/services/Ads';
import { MIC_PRE_PROMPT, VoiceMimic, voiceFailureMessage } from '@/services/VoiceMimic';
import { ActionTray, type TrayItem } from '@/ui/ActionTray';
import { BUTTON_HEIGHT, Button } from '@/ui/Button';
import { Hud } from '@/ui/Hud';
import { MeterBar } from '@/ui/MeterBar';
import { NavBar } from '@/ui/NavBar';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { drawIcon, type IconName } from '@/ui/icons';
import { DEPTH, FONT_BODY, FONT_DISPLAY, RADIUS, roomColumn, uiColumn } from '@/ui/theme';
import { bakeStatic, buildRoomLayers } from '@/scenes/rooms';
import { SCENE } from '@/scenes/keys';
import { setNames, t, type MessageKey } from '@/i18n';
import { NAME_MAX_LENGTH, cleanName } from '@/core/SaveManager';
import { openNameDialog } from '@/ui/nameDialog';
import { foodName } from '@/i18n/content';
import { analytics } from '@/services/Analytics';

/** Which stat each room fixes — drives the nav "needs you" dots. */
const STAT_ROOM: Readonly<Record<StatKey, RoomKey>> = {
  hunger: 'kitchen',
  energy: 'bed',
  fun: 'play',
  clean: 'bath',
};

const STAT_UI: Readonly<Record<StatKey, { icon: IconName; accent: number }>> = {
  hunger: { icon: 'meat', accent: PALETTE.meterHunger },
  energy: { icon: 'bolt', accent: PALETTE.meterEnergy },
  fun: { icon: 'star', accent: PALETTE.meterFun },
  clean: { icon: 'drop', accent: PALETTE.meterClean },
};

/** Stat names for the return card. Keys, resolved when the card is drawn. */
const STAT_LABEL: Readonly<Record<StatKey, MessageKey>> = {
  hunger: 'stat.hunger',
  energy: 'stat.energy',
  fun: 'stat.fun',
  clean: 'stat.clean',
};

/** Top of the right-hand button column. The tutorial spotlights this spot. */
const TASKS_BUTTON_Y = 74;

const FOOD_ICON: Readonly<Record<string, IconName>> = {
  fish: 'fish',
  milk: 'milk',
  steak: 'steak',
  cake: 'cake',
  sushi: 'sushi',
  feast: 'feast',
};

export class HomeScene extends Phaser.Scene {
  private context!: GameContext;
  private dailyLogin!: DailyLogin;
  private voice!: VoiceMimic;

  private rig!: PetRig;
  private animator!: PetAnimator;
  private idleDirector!: IdleDirector;
  private moodResolver!: MoodResolver;

  private hud!: Hud;
  private navBar!: NavBar;
  private tray!: ActionTray;
  private toast!: Toast;
  private meters = new Map<StatKey, MeterBar>();
  private roomLayers = new Map<RoomKey, Phaser.GameObjects.Container>();
  private sceneLayer!: Phaser.GameObjects.Container;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private adButton!: Phaser.GameObjects.Container;
  private tasksButton!: Phaser.GameObjects.Container;
  private tasksBadge!: Phaser.GameObjects.Container;
  private zzzTimer: Phaser.Time.TimerEvent | null = null;
  private returnCard: Sheet | null = null;
  private micPrompt: Sheet | null = null;
  private micPromptAccepted = false;

  private currentRoom: RoomKey = 'home';
  /**
   * The centred column the controls live in. On a phone it IS the canvas; on a
   * wide screen the room fills the canvas and this stays readable in the middle.
   */
  private ui = { left: 0, width: 0 };
  private sceneHeight = 0;
  private overlayOpen = false;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super(SCENE.home);
  }

  create(): void {
    /*
     * Reset every piece of session state HERE, not in a field initialiser.
     *
     * Phaser reuses the scene INSTANCE across stop/start, so a field
     * initialiser runs once in the lifetime of the game and never again.
     * `overlayOpen` was declared that way, and the consequence was not subtle:
     * restarting the game while a sheet was open — which is exactly what the
     * language switch and the backup-code restore both do — left it stuck at
     * true on the reused instance, and from then on every guard that reads it
     * refused to open anything. Rooms still worked, so the game looked alive
     * while the settings, shop and tasks buttons were all silently dead.
     *
     * MiniGameScene and CopycatScene already carry this warning. This scene is
     * the one that needed it.
     */
    this.overlayOpen = false;
    this.currentRoom = 'home';
    this.micPromptAccepted = false;
    this.returnCard = null;
    this.micPrompt = null;
    this.zzzTimer = null;
    this.meters.clear();
    this.roomLayers.clear();

    this.context = GameContext.from(this);
    this.dailyLogin = new DailyLogin(this.context.state, this.context.economy, this.context.clock);
    this.voice = new VoiceMimic();

    const { width, height } = this.scale.gameSize;
    const dockHeight = 232;
    this.sceneHeight = height - dockHeight;
    this.ui = uiColumn(width);

    this.cameras.main.setBackgroundColor(BACKDROP);

    this.buildBackground(width);
    this.buildRooms(width);
    this.buildPet(width);
    this.buildDock(width, height, dockHeight);
    this.buildTopBar(width);
    this.buildSideButtons(width);

    this.toast = new Toast(this, width / 2, 128, this.ui.width - 40);

    this.bindState();
    this.bindTasks();
    this.bindLifecycle();
    this.selectRoom('home');
    this.refreshAll();

    this.idleDirector = new IdleDirector(this, this.animator);
    this.idleDirector.start();

    /*
     * Naming comes FIRST, before the tutorial, because the tutorial introduces
     * her by name — "This is {pet}" reading "This is Biskit" to someone who is
     * about to call her something else is a worse first impression than one
     * extra screen. Everything else queues behind it.
     */
    if (this.context.state.playerName.length === 0 || this.context.state.petName.length === 0) {
      this.askForNames(() => this.startOpeningSequence());
    } else {
      this.startOpeningSequence();
    }
  }

  private startOpeningSequence(): void {
    // Tutorial first, and nothing else on top of it: a daily-login sheet over a
    // coach mark is how a first session gets abandoned. The other two run once
    // it is finished or skipped.
    if (this.context.state.tutorialStep >= 0) {
      this.startTutorial(() => {
        this.showDailyLogin();
        this.showReturnCard(this.context.takeOfflineReport());
      });
    } else {
      this.showDailyLogin();
      this.showReturnCard(this.context.takeOfflineReport());
    }
  }

  /**
   * Ask, apply, and rebuild.
   *
   * `after` runs only once names exist, so the caller can queue the tutorial
   * behind it without checking again. On the first run the dialog has no way
   * out; from Settings it gets a Cancel.
   */
  private askForNames(after: () => void, allowCancel = false): void {
    const { state } = this.context;
    this.overlayOpen = true;

    openNameDialog({
      title: t(allowCancel ? 'name.edit.title' : 'name.title'),
      body: t('name.body'),
      playerLabel: t('name.player.label'),
      petLabel: t('name.pet.label'),
      playerPlaceholder: t('name.player.placeholder'),
      petPlaceholder: t('name.pet.placeholder'),
      confirmLabel: t(allowCancel ? 'name.edit.confirm' : 'name.confirm'),
      requiredMessage: t('name.required'),
      maxLength: NAME_MAX_LENGTH,
      initialPlayer: state.playerName,
      initialPet: state.petName,
      ...(allowCancel
        ? {
            cancelLabel: t('name.edit.cancel'),
            onCancel: () => {
              this.overlayOpen = false;
            },
          }
        : {}),
      onConfirm: (playerName, petName) => {
        // Through the same cleaner a save off disk goes through, so a name
        // typed with control characters cannot reach a label or a notification.
        const player = cleanName(playerName);
        const pet = cleanName(petName);
        state.setNames(player, pet);
        setNames(player, pet);
        void this.context.save.flush();
        this.overlayOpen = false;
        // Labels are baked textures; the ones that name her have to be rebuilt.
        this.refreshAll();
        this.context.audio.play('coin');
        after();
      },
    });
  }

  /* --------------------------- construction -------------------------- */

  private buildBackground(width: number): void {
    const floorY = this.sceneHeight * 0.7;

    // Everything static goes into one container and is baked to a single
    // texture: a Graphics object is re-tessellated every frame, so a full-screen
    // gradient costs the same standing still as it does moving.
    const backdrop = this.add.container(0, 0).setDepth(DEPTH.room);

    const wall = this.add.graphics();
    wall.fillGradientStyle(PALETTE.wallHi, PALETTE.wallHi, PALETTE.wallLo, PALETTE.wallLo, 1);
    wall.fillRect(0, 0, width, floorY);

    const floor = this.add.graphics();
    floor.fillGradientStyle(PALETTE.floor, PALETTE.floor, PALETTE.floorLo, PALETTE.floorLo, 1);
    floor.fillRect(0, floorY, width, this.sceneHeight - floorY);
    // Skirting board.
    floor.fillStyle(PALETTE.cream, 1);
    floor.fillRect(0, floorY - 16, width, 16);
    floor.fillStyle(PALETTE.prop, 1);
    floor.fillRect(0, floorY - 6, width, 6);
    // Floorboards.
    floor.lineStyle(4, PALETTE.line, 0.16);
    for (let x = -80; x < width + 160; x += 54) {
      floor.lineBetween(x, floorY, x - 60, this.sceneHeight);
    }

    // Dust motes drifting in the window light.
    for (const [i, spec] of ([
      [0.12, 0.52, 3.5, 13_000],
      [0.26, 0.66, 2.5, 17_000],
      [0.71, 0.58, 4, 15_000],
      [0.86, 0.7, 2.5, 19_000],
      [0.47, 0.74, 3, 16_000],
    ] as const).entries()) {
      const [fx, fy, radius, duration] = spec;
      const mote = this.add.graphics().setDepth(DEPTH.props);
      mote.fillStyle(PALETTE.white, 1);
      mote.fillCircle(0, 0, radius);
      mote.setPosition(width * fx, this.sceneHeight * fy).setAlpha(0);
      this.tweens.add({
        targets: mote,
        y: this.sceneHeight * fy - 190,
        x: width * fx + 26,
        alpha: { from: 0, to: 0.5 },
        duration,
        delay: i * 2600,
        repeat: -1,
        ease: 'Linear',
        yoyo: false,
      });
    }

    // Warm pool of light from above, and a vignette to pull focus to the pet.
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE.white, 0.16);
    glow.fillEllipse(width / 2, this.sceneHeight * 0.16, width, this.sceneHeight * 0.68);

    const vignette = this.add.graphics();
    vignette.fillStyle(PALETTE.ink, 0.16);
    vignette.fillRect(0, 0, width, 26);
    vignette.fillRect(0, this.sceneHeight - 26, width, 26);

    backdrop.add([wall, floor, glow, vignette]);
    bakeStatic(this, backdrop, width, this.sceneHeight);

    this.nightOverlay = this.add
      .rectangle(0, 0, width, this.sceneHeight, NIGHT_TINT, 0)
      .setOrigin(0)
      .setDepth(DEPTH.sceneOverlay + 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  private buildRooms(width: number): void {
    // The furniture is composed in its own centred column and the whole layer
    // is shifted into place, so every prop keeps the relationship to the pet it
    // was drawn with. The wall and floor behind it still span the canvas.
    const column = roomColumn(width);
    this.sceneLayer = this.add.container(column.left, 0).setDepth(DEPTH.props);
    this.roomLayers = buildRoomLayers(this, {
      width: column.width,
      height: this.sceneHeight,
      floorY: this.sceneHeight * 0.7,
    });
    for (const layer of this.roomLayers.values()) {
      this.sceneLayer.add(layer);
    }
  }

  private buildPet(width: number): void {
    const scale = (this.sceneHeight * 0.55) / DESIGN_HEIGHT;
    const feetY = this.sceneHeight - 52;

    const shadow = this.add.graphics().setDepth(DEPTH.petShadow);
    shadow.fillStyle(PALETTE.ink, 0.16);
    shadow.fillEllipse(width / 2, feetY + 6, 196 * scale, 30 * scale);

    this.rig = new PetRig(this, width / 2, feetY);
    this.rig.root.setScale(scale).setDepth(DEPTH.pet);
    this.rig.setAccessory(this.context.state.equipped.hat);

    this.animator = new PetAnimator(this, this.rig);
    this.moodResolver = new MoodResolver(this.rig);
    this.animator.setSleeping(this.context.state.isSleeping);

    // The pet itself is the biggest tap target in the game.
    const hit = this.add
      .rectangle(
        width / 2,
        feetY - (DESIGN_HEIGHT * scale) / 2,
        220 * scale,
        DESIGN_HEIGHT * scale,
        0x000000,
        0,
      )
      .setDepth(DEPTH.pet)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onPetTapped());
  }

  private buildDock(width: number, height: number, dockHeight: number): void {
    const top = height - dockHeight;

    const dockLayer = this.add.container(0, 0).setDepth(DEPTH.dock);
    const dock = this.add.graphics();
    dock.fillGradientStyle(0xc6b0ec, 0xc6b0ec, 0x7a5fb5, 0x7a5fb5, 1);
    dock.fillRect(0, top, width, dockHeight);
    dock.fillStyle(PALETTE.line, 1);
    dock.fillRect(0, top, width, 6);
    dock.fillStyle(PALETTE.white, 0.28);
    dock.fillRect(0, top + 6, width, 7);
    dockLayer.add(dock);
    bakeStatic(this, dockLayer, width, height);

    /*
     * The dock BAND spans the whole canvas, but the controls on it live in the
     * centred column. Stretching four meters and five tabs across a 1500px
     * canvas leaves them unreadable and miles from the thumb.
     */
    const pad = 14;
    const gap = 7;
    const inner = this.ui.width - pad * 2;
    const meterWidth = (inner - gap * (STAT_KEYS.length - 1)) / STAT_KEYS.length;
    STAT_KEYS.forEach((key, i) => {
      const ui = STAT_UI[key];
      const meter = new MeterBar(this, this.ui.left + pad + i * (meterWidth + gap), top + 16, {
        width: meterWidth,
        icon: ui.icon,
        accent: ui.accent,
      });
      meter.setDepth(DEPTH.dock);
      this.meters.set(key, meter);
    });

    /* action tray */
    this.tray = new ActionTray(this, this.ui.left, top + 88, this.ui.width, (id) =>
      this.onTrayPress(id),
    );
    this.tray.setDepth(DEPTH.dock);

    /* nav */
    this.navBar = new NavBar(this, this.ui.left + pad, top + 172, inner, (key) =>
      this.selectRoom(key),
    );
    this.navBar.setDepth(DEPTH.dock);
  }

  private buildTopBar(width: number): void {
    void width;
    this.hud = new Hud(this, this.ui.left + 14, 12, this.ui.width, 14);

    // The settings gear lives in the gap between the level pill and the
    // purses, so it never fights the two side buttons for the same corner.
    const gear = this.add.container(this.ui.left + 150, 16).setDepth(DEPTH.topBar);
    const disc = this.add.graphics();
    disc.fillStyle(PALETTE.ink, 0.58);
    disc.fillCircle(17, 17, 17);
    disc.lineStyle(2, PALETTE.white, 0.22);
    disc.strokeCircle(17, 17, 17);
    gear.add(disc);

    const glyph = drawIcon(this, 'gear', 20, PALETTE.white, 2.2);
    glyph.setPosition(17, 17);
    gear.add(glyph);

    const hit = this.add
      .rectangle(17, 17, 40, 40, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.openSettings());
    gear.add(hit);
  }

  private buildSideButtons(width: number): void {
    void width;
    // Against the column's right edge, not the canvas'. On a wide screen the
    // canvas edge is off in the corner of the room where nobody looks.
    const x = this.ui.left + this.ui.width - 66;

    // Tasks sits at the top of the column, above the shop and the ad: it is the
    // answer to "what do I do now", so it must be the first thing found.
    this.tasksButton = this.roundButton(x, TASKS_BUTTON_Y, PALETTE.mint, 'star', () =>
      this.openTasks(),
    );
    this.tasksButton.setDepth(DEPTH.sideButtons);
    this.tasksBadge = this.buildBadge(x + 44, TASKS_BUTTON_Y + 4);

    const shop = this.roundButton(x, 136, PALETTE.grape, 'hat', () => this.openShop());
    shop.setDepth(DEPTH.sideButtons);

    this.adButton = this.roundButton(x, 198, PALETTE.butter, 'tv', () => {
      void this.watchAd();
    });
    this.adButton.setDepth(DEPTH.sideButtons);

    // Reward tag, on the dark pill the prototype uses — white text alone is
    // unreadable against the wall.
    const tag = this.add.container(x + 26, 198 + 52).setDepth(DEPTH.sideButtons);
    const label = this.add
      .text(0, 0, `+${EARN.rewardedAdCoins}`, {
        fontFamily: FONT_DISPLAY,
        fontSize: '11.5px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const pill = this.add.graphics();
    pill.fillStyle(PALETTE.ink, 1);
    pill.fillRoundedRect(-label.width / 2 - 7, -9, label.width + 14, 18, 9);
    tag.add([pill, label]);
    tag.setVisible(false);
    this.adButton.setData('tag', tag);

    // The ad button nudges every few seconds, the way the prototype's does.
    this.tweens.add({
      targets: this.adButton,
      y: 193,
      duration: 180,
      yoyo: true,
      repeat: -1,
      repeatDelay: 2400,
      ease: 'Sine.easeOut',
    });
  }

  /** Count bubble on the tasks button. Hidden at zero rather than showing "0". */
  private buildBadge(x: number, y: number): Phaser.GameObjects.Container {
    const badge = this.add.container(x, y).setDepth(DEPTH.sideButtons + 1).setVisible(false);
    const disc = this.add.graphics();
    disc.fillStyle(PALETTE.coral, 1);
    disc.lineStyle(2.5, PALETTE.white, 1);
    disc.fillCircle(0, 0, 12);
    disc.strokeCircle(0, 0, 12);
    const label = this.add
      .text(0, 0, '', {
        fontFamily: FONT_DISPLAY,
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    badge.add([disc, label]);
    badge.setData('label', label);
    return badge;
  }

  private roundButton(
    x: number,
    y: number,
    color: number,
    icon: IconName,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const size = 52;
    const container = this.add.container(x, y);

    const face = this.add.graphics();
    face.fillStyle(PALETTE.ink, 0.28);
    face.fillRoundedRect(0, 5, size, size, RADIUS.button);
    face.fillStyle(color, 1);
    face.fillRoundedRect(0, 0, size, size, RADIUS.button);
    container.add(face);

    const glyph = drawIcon(this, icon, 24, color === PALETTE.butter ? 0x6b4a0e : PALETTE.white, 2.2);
    glyph.setPosition(size / 2, size / 2);
    container.add(glyph);

    const hit = this.add
      .rectangle(size / 2, size / 2, size, size + 5, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onPress);
    container.add(hit);

    return container;
  }

  /* ------------------------------ binding ---------------------------- */

  private bindState(): void {
    const { state, economy, progression } = this.context;

    this.unsubscribers.push(
      state.events.on('stats', () => this.refreshStats()),
      state.events.on('currency', ({ coins, gems }) => {
        this.hud.setCurrency(coins, gems);
        this.refreshTray();
      }),
      state.events.on('progress', ({ level, xp }) => {
        this.hud.setProgress(level, levelProgress(level, xp));
      }),
      state.events.on('sleep', ({ isSleeping }) => this.applySleepVisuals(isSleeping)),
      state.events.on('inventory', ({ equipped }) => this.rig.setAccessory(equipped.hat)),

      economy.events.on('denied', () => {
        this.context.audio.play('denied');
        this.toast.show(t('common.toast.notEnoughCoins'));
      }),
      economy.events.on('earned', ({ amount, source }) => {
        if (source === 'level-up') return;
        this.floatText(`+${amount}`, '#ffd46b');
      }),

      progression.events.on('levelUp', ({ level, gemsAwarded }) => {
        this.context.audio.play('level');
        this.floatText(`LEVEL ${level}!`, '#7fd9b8');
        this.animator.play('hop');
        this.toast.show(`Level ${level} — ${gemsAwarded} gems added`);
        this.refreshTray();
      }),
    );
  }

  private bindTasks(): void {
    this.unsubscribers.push(
      this.context.tasks.events.on('changed', () => this.refreshTasksBadge()),
      this.context.tasks.events.on('completed', ({ def }) => {
        this.context.audio.play('level');
        this.toast.show(`Task done — ${def.label}`);
      }),
    );

    // A task row the player has not finished sends them to where it is done.
    // Naming the room is not enough when they do not yet know the tabs exist.
    this.events.on('tasks-goto', (room: RoomKey | 'shop') => {
      if (room === 'shop') this.openShop();
      else this.selectRoom(room);
    });

    this.refreshTasksBadge();
  }

  private bindLifecycle(): void {
    // Unlock the audio context on the very first interaction (iOS requirement),
    // and start the music on the same gesture — it is the earliest moment a
    // browser will allow any sound at all.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      this.context.audio.unlock();
      this.context.music.start();
    });
    // `once`, not `on`: create() runs again on every restart, so `on` would
    // stack a fresh teardown listener each time and run teardown N times on the
    // Nth shutdown.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    // `main.ts` owns pause/resume — it is the only place that knows whether we
    // are inside Capacitor or a browser tab. The scene just reacts, and
    // unsubscribes on shutdown so a restart cannot leave a dead listener behind.
    this.unsubscribers.push(
      this.context.events.on('resumed', (report) => this.showReturnCard(report)),
    );
  }

  private teardown(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.idleDirector?.destroy();
    this.animator?.destroy();
    this.zzzTimer?.remove();
  }

  /* ------------------------------ update ----------------------------- */

  override update(): void {
    // Nothing else drives decay: one tick, one owner. The system reads the
    // clock itself, so a dropped frame cannot slow the pet down.
    this.context.stats.tick();
  }

  /* ------------------------------ rooms ------------------------------ */

  private selectRoom(key: RoomKey): void {
    if (key === 'play') {
      this.openMiniGame();
      return;
    }

    if (this.currentRoom !== key) {
      this.context.audio.play('room');
      // Leaving the bedroom wakes the pet — the lights are on elsewhere.
      if (this.context.state.isSleeping && key !== 'bed') {
        this.context.state.setSleeping(false);
      }
    }

    this.currentRoom = key;
    this.navBar.selectRoom(key);

    for (const [roomKey, layer] of this.roomLayers) {
      const show = roomKey === key;
      this.tweens.killTweensOf(layer);
      if (show) layer.setVisible(true);
      this.tweens.add({
        targets: layer,
        alpha: show ? 1 : 0,
        duration: 400,
        ease: 'Sine.easeInOut',
        // An alpha-0 layer still costs a render pass; `visible` is what skips it.
        onComplete: () => layer.setVisible(show),
      });
    }

    this.refreshTray();
  }

  /* ----------------------------- actions ----------------------------- */

  private onTrayPress(id: string): void {
    if (id === 'pet') return this.onPetTapped();
    if (id === 'voice') return void this.onVoicePressed();
    if (id === 'scrub') return this.onScrub();
    if (id === 'sleep') return this.onSleepToggle();
    if (id.startsWith('food:')) {
      const food = FOODS.find((f) => f.id === id.slice('food:'.length));
      // Re-checked here rather than trusting the tray's `disabled` flag: the
      // tray is rebuilt on a level-up, and a tap already in flight when that
      // happens would otherwise feed a food the player has not unlocked.
      if (food && this.context.progression.isLevelReached(food.unlockLevel)) {
        this.onFeed(food);
      }
    }
  }

  private onPetTapped(): void {
    if (this.overlayOpen) return;
    if (this.context.state.isSleeping) {
      // A tap on a sleeping pet wakes it rather than doing nothing.
      this.onSleepToggle();
      return;
    }

    this.idleDirector.noteTouch();
    this.context.audio.play('tap');
    this.context.state.addStat('fun', PET_FUN_GAIN);
    this.context.progression.award('pet');
    this.animator.play('squash');
    this.floatText(
      ['love', 'purr', 'yay', 'nice'][Phaser.Math.Between(0, 3)] ?? 'purr',
      '#ff9fb0',
    );
  }

  private onFeed(food: FoodDef): void {
    const { state, economy, progression } = this.context;
    if (state.isSleeping) {
      this.toast.show(t('home.toast.asleep'));
      return;
    }
    if (state.stat('hunger') > 94) {
      this.toast.show(t('home.toast.full'));
      return;
    }
    if (!economy.spend(food.cost, 'food')) return;

    // Tracked HERE, not inferred from Economy. `spend()` returns early on a
    // zero cost, so the free fish — the most-used action in the game, and the
    // one a new player takes first — produced no event at all.
    analytics.track('fed', { food: food.id, cost: food.cost, level: state.level });

    this.idleDirector.noteTouch();
    this.context.audio.play('eat');
    state.addStat('hunger', food.hunger);
    if (food.fun) state.addStat('fun', food.fun);
    state.addStat('clean', -FEED_CLEAN_PENALTY);
    progression.award('feed');

    this.animator.play('eat');
    this.floatText(`+${food.hunger}`, '#ff6b6b');
    this.refreshTray();
  }

  private onScrub(): void {
    const { state, progression } = this.context;
    if (state.isSleeping) {
      this.toast.show(t('home.toast.asleep'));
      return;
    }
    if (state.stat('clean') >= 100) {
      this.toast.show('Already sparkling');
      return;
    }

    this.idleDirector.noteTouch();
    this.context.audio.play('bubble');
    state.addStat('clean', SCRUB_CLEAN_GAIN);
    progression.award('scrub');
    this.animator.play('squash');
    this.spawnBubbles(6);

    if (state.stat('clean') >= 100) {
      this.floatText('Squeaky!', '#6ec5e9');
    }
  }

  private onSleepToggle(): void {
    const { state } = this.context;
    const next = !state.isSleeping;
    state.setSleeping(next);
    this.idleDirector.noteTouch();

    if (next) {
      // The only task trigger with no XP award behind it, so it is reported by
      // hand rather than picked up off `xpGained`.
      this.context.tasks.report('sleep');
      this.toast.show('Lights out — energy refilling');
    } else {
      this.animator.play('hop');
    }
    this.refreshTray();
  }

  private async onVoicePressed(): Promise<void> {
    if (this.context.state.isSleeping) {
      this.toast.show(t('home.toast.asleep'));
      return;
    }
    if (!VoiceMimic.available) {
      this.toast.show(voiceFailureMessage('unsupported'));
      return;
    }
    if (this.voice.isBusy) return;

    // Pre-prompt before the OS dialog, so the ask has context (§9.4).
    // "Not now" is an answer: the prompt comes back next time rather than
    // dropping the player straight into the system permission dialog.
    if (!this.micPromptAccepted) {
      this.showMicPrePrompt();
      return;
    }
    await this.runVoiceMimic();
  }

  private showMicPrePrompt(): void {
    if (this.micPrompt) {
      this.overlayOpen = true;
      this.idleDirector.setPaused(true);
      this.micPrompt.show();
      return;
    }

    const { width, height } = this.scale.gameSize;
    const sheet = new Sheet(this, width, height, {
      title: MIC_PRE_PROMPT.title,
      maxHeightRatio: 0.42,
      onClose: () => {
        this.overlayOpen = false;
        this.idleDirector.setPaused(false);
      },
    });
    this.micPrompt = sheet;

    // The PANEL's width, not the canvas's. On a phone they are the same number
    // and the difference is invisible; on a desktop the canvas is 1560 and the
    // panel is capped at 600, so anything measured against the canvas lands up
    // to 960px outside the card it is supposed to be inside.
    const panel = sheet.panelWidth;

    sheet.content.add(
      this.add
        .text(20, 0, MIC_PRE_PROMPT.body, {
          fontFamily: FONT_BODY,
          fontSize: '13px',
          color: '#5b486b',
          fontStyle: 'bold',
          wordWrap: { width: panel - 40 },
          lineSpacing: 4,
        })
        .setOrigin(0),
    );

    sheet.content.add(
      new Button(this, 20, 90, MIC_PRE_PROMPT.confirm, {
        width: panel - 40,
        tone: 'mint',
        onPress: () => {
          this.micPromptAccepted = true;
          sheet.close();
          void this.runVoiceMimic();
        },
      }),
    );
    sheet.content.add(
      new Button(this, 20, 152, MIC_PRE_PROMPT.decline, {
        width: panel - 40,
        tone: 'coral',
        onPress: () => sheet.close(),
      }),
    );

    sheet.fitToContent(152 + BUTTON_HEIGHT);
    this.overlayOpen = true;
    this.idleDirector.setPaused(true);
    sheet.show();
  }

  private async runVoiceMimic(): Promise<void> {
    this.idleDirector.noteTouch();
    this.voice.setCallbacks({
      onStateChange: (state) => {
        if (state === 'recording') this.toast.show(t('home.toast.listening'));
        if (state === 'playing') this.animator.setTalking(true);
        if (state === 'idle') this.animator.setTalking(false);
      },
      onAmplitude: (amplitude) => this.animator.setMouthOpen(amplitude),
    });

    const result = await this.voice.run();
    this.animator.setTalking(false);

    if (result.status === 'failed') {
      // Never block the game on a mic problem (§15).
      this.toast.show(voiceFailureMessage(result.reason));
      return;
    }

    this.context.state.addStat('fun', VOICE_FUN_GAIN);
    this.context.progression.award('voiceMimic');
  }

  private async watchAd(): Promise<void> {
    const result = await this.context.ads.showRewarded();
    const message = adResultMessage(result);

    if (result.status === 'rewarded') {
      this.context.audio.play('coin');
      this.animator.play('hop');
    } else if (message) {
      this.toast.show(message);
    }
    this.refreshAdButton();
  }

  /* ---------------------------- overlays ----------------------------- */

  private openShop(): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.idleDirector.setPaused(true);
    this.scene.launch(SCENE.shop);
    this.scene.bringToTop(SCENE.shop);
    this.events.once('shop-closed', () => {
      this.overlayOpen = false;
      this.idleDirector.setPaused(false);
      this.refreshAll();
    });
  }

  private startTutorial(onFinished?: () => void): void {
    this.overlayOpen = true;
    this.idleDirector?.setPaused(true);
    this.scene.launch(SCENE.tutorial);
    this.scene.bringToTop(SCENE.tutorial);
    this.events.once('tutorial-finished', () => {
      this.overlayOpen = false;
      this.idleDirector?.setPaused(false);
      onFinished?.();
    });
  }

  private openTasks(): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.idleDirector.setPaused(true);
    this.context.audio.play('room');
    this.scene.launch(SCENE.tasks);
    this.scene.bringToTop(SCENE.tasks);
    this.events.once('tasks-closed', () => {
      this.overlayOpen = false;
      this.idleDirector.setPaused(false);
      this.refreshAll();
    });
  }

  /**
   * The count of finished-but-uncollected tasks. Nothing pulls a player back
   * into a menu like a number on it, and nothing annoys them like a number that
   * is still there after they have collected everything.
   */
  private refreshTasksBadge(): void {
    const claimable = this.context.tasks.claimableCount;
    this.tasksBadge.setVisible(claimable > 0);
    if (claimable > 0) {
      (this.tasksBadge.getData('label') as Phaser.GameObjects.Text).setText(String(claimable));
    }
  }

  private openSettings(): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.idleDirector.setPaused(true);
    this.scene.launch(SCENE.settings);
    this.scene.bringToTop(SCENE.settings);
    // Queued, not handled inline: the row closes the sheet and the edit runs
    // once `settings-closed` has put the scene back in a normal state.
    let wantsNameEdit = false;
    this.events.once('edit-names', () => {
      wantsNameEdit = true;
    });

    this.events.once('settings-closed', () => {
      this.overlayOpen = false;
      this.idleDirector.setPaused(false);
      this.refreshAll();
      if (wantsNameEdit) {
        this.askForNames(() => undefined, true);
        return;
      }
      // "Replay tutorial" re-arms the step counter; honour it on the way out.
      if (this.context.state.tutorialStep >= 0) this.startTutorial();
    });
  }

  /**
   * Play is a launcher, and now it launches one of two things.
   *
   * The chooser is shown even before Copycat unlocks, with that card greyed
   * and labelled with its level. Sending the player straight into Catch until
   * level 5 would save a tap and cost them the only on-screen evidence that
   * levelling buys anything at all — the same argument as leaving locked food
   * on the kitchen tray.
   */
  private openMiniGame(): void {
    this.overlayOpen = true;
    this.idleDirector.setPaused(true);
    this.navBar.setInputEnabled(false);

    const { width, height } = this.scale.gameSize;
    const unlocked = this.context.progression.isUnlocked('secondMiniGame');

    const chooser = new Sheet(this, width, height, {
      title: t('play.title'),
      subtitle: t('play.subtitle'),
      maxHeightRatio: 0.62,
      onClose: () => this.endMiniGameSession(),
    });

    const pad = 14;
    const panel = chooser.panelWidth;
    const cardWidth = panel - pad * 2;
    const cardHeight = 104;

    const games = [
      {
        key: SCENE.miniGame,
        icon: 'fish' as IconName,
        name: t('play.catch.name'),
        blurb: t('play.catch.blurb'),
        level: 1,
      },
      {
        key: SCENE.copycat,
        icon: 'star' as IconName,
        name: t('play.copycat.name'),
        blurb: t('play.copycat.blurb'),
        level: UNLOCK_LEVEL.secondMiniGame,
      },
    ];

    games.forEach((game, i) => {
      const open = game.level === 1 || unlocked;
      const y = i * (cardHeight + 10);
      const card = this.add.container(pad, y);

      const face = this.add.graphics();
      face.fillStyle(PALETTE.ink, 1);
      face.fillRoundedRect(0, 5, cardWidth, cardHeight, RADIUS.card);
      face.fillStyle(PALETTE.white, 1);
      face.lineStyle(3, PALETTE.ink, 1);
      face.fillRoundedRect(0, 0, cardWidth, cardHeight, RADIUS.card);
      face.strokeRoundedRect(0, 0, cardWidth, cardHeight, RADIUS.card);
      card.add(face);

      const badge = drawIcon(this, game.icon, 40, PALETTE.grape, 3);
      badge.setPosition(48, cardHeight / 2);
      card.add(badge);

      card.add(
        this.add
          .text(90, 30, game.name, {
            fontFamily: FONT_DISPLAY,
            fontSize: '21px',
            color: '#3b2a5e',
            fontStyle: 'bold',
          })
          .setOrigin(0),
      );
      card.add(
        this.add
          .text(90, 58, open ? game.blurb : t('play.locked', { level: game.level }), {
            fontFamily: FONT_BODY,
            fontSize: '12.5px',
            color: open ? '#5b486b' : '#a995c4',
            fontStyle: 'bold',
            wordWrap: { width: cardWidth - 104 },
          })
          .setOrigin(0),
      );

      if (open) {
        const hit = this.add
          .rectangle(cardWidth / 2, cardHeight / 2, cardWidth, cardHeight, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          chooser.destroy();
          this.launchMiniGame(game.key);
        });
        card.add(hit);
      } else {
        card.setAlpha(0.5);
      }

      chooser.content.add(card);
    });

    const closeY = games.length * (cardHeight + 10) + 6;
    chooser.content.add(
      new Button(this, pad, closeY, t('common.notNow'), {
        width: cardWidth,
        tone: 'coral',
        onPress: () => chooser.close(),
      }),
    );
    chooser.fitToContent(closeY + BUTTON_HEIGHT);
    chooser.show();
  }

  private launchMiniGame(key: string): void {
    this.scene.launch(key);
    this.scene.bringToTop(key);
    this.events.once('minigame-closed', () => this.endMiniGameSession());
  }

  private endMiniGameSession(): void {
    this.overlayOpen = false;
    this.idleDirector.setPaused(false);
    this.navBar.setInputEnabled(true);
    // The play tab is a launcher, not a room — go back where we were.
    this.navBar.selectRoom(this.currentRoom);
    this.refreshAll();
  }

  private showDailyLogin(): void {
    const result = this.dailyLogin.claim();
    if (!result.claimed) return;
    this.context.audio.play('coin');
    this.toast.show(t('home.dailyLogin', { day: result.streak, coins: result.coins }));
  }

  /** "Biskit missed you!" with what actually changed (§6). */
  private showReturnCard(report: OfflineReport | null): void {
    if (!report) return;
    if (report.clockWentBackwards) return;
    if (report.elapsedHours <= 1) return;
    if (this.returnCard?.isOpen) return;

    const { width, height } = this.scale.gameSize;
    const hours = Math.floor(report.elapsedHours);
    const away =
      hours >= 24
        ? t('common.duration.days', { n: Math.floor(hours / 24) })
        : t('common.duration.hours', { n: Math.max(1, hours) });

    const sheet =
      this.returnCard ??
      new Sheet(this, width, height, {
        title: t('home.return.title'),
        maxHeightRatio: 0.5,
        onClose: () => {
          this.overlayOpen = false;
          this.idleDirector.setPaused(false);
        },
      });
    this.returnCard = sheet;
    sheet.content.removeAll(true);

    // Same trap as the mic prompt, and this is where it actually showed: the
    // delta numbers were placed at `width - 24`, which on a desktop canvas is
    // 1536 — nearly a thousand pixels right of a 600-wide card. They were being
    // drawn every time, off the panel, so the card listed "hunger, energy, fun,
    // clean" with no values and looked like a bug in the stat system.
    const panel = sheet.panelWidth;

    sheet.content.add(
      this.add
        .text(20, -8, t('home.return.body', { duration: away }), {
          fontFamily: FONT_BODY,
          fontSize: '13px',
          color: '#5b486b',
          fontStyle: 'bold',
        })
        .setOrigin(0),
    );

    let y = 22;
    for (const key of STAT_KEYS) {
      const delta = report.deltas[key];
      if (Math.abs(delta) < 0.5) continue;

      const icon = drawIcon(this, STAT_UI[key].icon, 20, STAT_UI[key].accent, 2.4);
      icon.setPosition(34, y + 10);
      sheet.content.add(icon);

      sheet.content.add(
        this.add
          .text(56, y + 10, key === 'energy' && delta > 0 ? t('stat.energy.rested') : t(STAT_LABEL[key]), {
            fontFamily: FONT_BODY,
            fontSize: '13px',
            color: '#33243f',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5),
      );
      sheet.content.add(
        this.add
          .text(panel - 24, y + 10, `${delta > 0 ? '+' : ''}${Math.round(delta)}`, {
            fontFamily: FONT_DISPLAY,
            fontSize: '17px',
            color: delta > 0 ? '#2fb07f' : '#e06a8d',
            fontStyle: 'bold',
          })
          .setOrigin(1, 0.5),
      );
      y += 30;
    }

    if (report.capped) {
      sheet.content.add(
        this.add
          .text(20, y + 4, t('home.return.capped'), {
            fontFamily: FONT_BODY,
            fontSize: '11.5px',
            color: '#5b486b',
            wordWrap: { width: panel - 40 },
          })
          .setOrigin(0),
      );
      y += 28;
    }

    const buttonY = y + 12;
    sheet.content.add(
      new Button(this, 20, buttonY, t('home.return.confirm'), {
        width: panel - 40,
        tone: 'mint',
        onPress: () => sheet.close(),
      }),
    );

    sheet.fitToContent(buttonY + BUTTON_HEIGHT);
    this.overlayOpen = true;
    this.idleDirector.setPaused(true);
    sheet.show();
    this.animator.play('hop');
  }

  /* ------------------------------ refresh ---------------------------- */

  private refreshAll(): void {
    this.refreshTasksBadge();
    const { state } = this.context;
    this.hud.setCurrency(state.coins, state.gems);
    this.hud.setProgress(state.level, levelProgress(state.level, state.xp));
    this.refreshStats();
    this.refreshTray();
    this.refreshAdButton();
    this.applySleepVisuals(state.isSleeping);
  }

  private refreshStats(): void {
    const { state } = this.context;
    for (const key of STAT_KEYS) {
      const value = state.stat(key);
      this.meters.get(key)?.setValue(value, STAT_WARN_BELOW[key]);
      this.navBar.setDot(STAT_ROOM[key], value < STAT_WARN_BELOW[key]);
    }

    this.moodResolver.apply(state.stats, {
      isSleeping: state.isSleeping,
      isTalking: this.voice.currentState === 'playing',
      isEating: this.animator.isBusy && this.rig.mouth === 'open',
    });
  }

  private refreshTray(): void {
    const { state, economy } = this.context;
    let items: TrayItem[] = [];

    switch (this.currentRoom) {
      case 'home':
        items = [
          { id: 'voice', label: t('tray.talk.label'), caption: t('tray.talk.caption'), icon: 'mic' },
          { id: 'pet', label: t('tray.pet.label'), caption: t('tray.pet.caption'), icon: 'hand' },
        ];
        break;
      case 'kitchen':
        // Locked food stays on the tray rather than being hidden. A player who
        // cannot see Sushi has no reason to level; one who can see it greyed
        // out with "LEVEL 6" on it has been told exactly what levelling buys.
        items = FOODS.map((food) => {
          const unlocked = this.context.progression.isLevelReached(food.unlockLevel);
          return {
            id: `food:${food.id}`,
            label: foodName(food.id, food.name),
            caption: !unlocked
              ? t('tray.food.locked', { n: food.unlockLevel })
              : food.cost > 0
                ? `${food.cost}`
                : t('tray.food.free'),
            icon: FOOD_ICON[food.id] ?? 'meat',
            disabled: !unlocked || (food.cost > 0 && !economy.canAfford(food.cost)),
            priced: unlocked && food.cost > 0,
          };
        });
        break;
      case 'bath':
        items = [
          { id: 'scrub', label: t('tray.scrub.label'), caption: t('tray.scrub.caption'), icon: 'soap' },
          { id: 'scrub', label: t('tray.rinse.label'), caption: t('tray.rinse.caption'), icon: 'bath' },
        ];
        break;
      case 'bed':
        items = [
          {
            id: 'sleep',
            label: state.isSleeping ? t('tray.wake.label') : t('tray.sleep.label'),
            caption: state.isSleeping ? t('tray.wake.caption') : t('tray.sleep.caption'),
            icon: state.isSleeping ? 'sun' : 'moon',
          },
        ];
        break;
      case 'play':
        items = [];
        break;
    }

    this.tray.show(items);
  }

  private refreshAdButton(): void {
    const available = this.context.ads.isAvailable;
    this.adButton.setVisible(available);
    (this.adButton.getData('tag') as Phaser.GameObjects.Container | undefined)?.setVisible(available);
  }

  private applySleepVisuals(isSleeping: boolean): void {
    this.animator.setSleeping(isSleeping);
    this.tweens.add({
      targets: this.nightOverlay,
      alpha: isSleeping ? 0.55 : 0,
      duration: 600,
      ease: 'Sine.easeInOut',
    });

    this.zzzTimer?.remove();
    this.zzzTimer = null;
    if (!isSleeping) return;

    this.zzzTimer = this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => this.spawnZzz(),
    });
  }

  /* -------------------------------- fx ------------------------------- */

  private floatText(text: string, color: string): void {
    const { width } = this.scale.gameSize;
    const label = this.add
      .text(
        width / 2 + Phaser.Math.Between(-35, 35),
        this.sceneHeight * 0.38,
        text,
        {
          fontFamily: FONT_DISPLAY,
          fontSize: '27px',
          color,
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.fx)
      .setStroke('#46356b', 6);

    this.tweens.add({
      targets: label,
      y: label.y - 100,
      scale: { from: 0.5, to: 1.1 },
      alpha: { from: 1, to: 0 },
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private spawnBubbles(count: number): void {
    const { width } = this.scale.gameSize;
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 70, () => {
        const size = Phaser.Math.Between(7, 22);
        const bubble = this.add.graphics().setDepth(DEPTH.fx);
        bubble.fillStyle(0xaee0f7, 0.4);
        bubble.fillCircle(0, 0, size);
        bubble.lineStyle(3, PALETTE.white, 0.85);
        bubble.strokeCircle(0, 0, size);
        bubble.setPosition(
          width / 2 + Phaser.Math.Between(-80, 80),
          this.sceneHeight * 0.62,
        );

        this.tweens.add({
          targets: bubble,
          y: bubble.y - 200,
          scale: { from: 0.2, to: 1.2 },
          alpha: { from: 1, to: 0 },
          duration: 1600,
          ease: 'Cubic.easeOut',
          onComplete: () => bubble.destroy(),
        });
      });
    }
  }

  private spawnZzz(): void {
    const { width } = this.scale.gameSize;
    const z = this.add
      .text(width / 2 + 60, this.sceneHeight * 0.34, 'z', {
        fontFamily: FONT_DISPLAY,
        fontSize: `${Phaser.Math.Between(18, 34)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.fx);

    this.tweens.add({
      targets: z,
      x: z.x + 50,
      y: z.y - 130,
      angle: 16,
      scale: { from: 0.5, to: 1.35 },
      alpha: { from: 0.95, to: 0 },
      duration: 2400,
      ease: 'Cubic.easeOut',
      onComplete: () => z.destroy(),
    });
  }
}

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
  FEEDING,
  FOODS,
  PET_FUN_GAIN,
  RELIEF,
  TEMPER,
  EARN,
  BATHING,
  STAT_WARN_BELOW,
  UNLOCK_LEVEL,
  PHOTO,
  VOICE_FUN_GAIN,
  type FoodDef,
  type WearSlot,
} from '@/config/tuning';
import { DailyLogin } from '@/core/DailyLogin';
import { reliefState } from '@/core/StatSystem';
import { GameContext } from '@/core/GameContext';
import { levelProgress } from '@/core/Progression';
import { STAT_KEYS, type OfflineReport, type RoomKey, type StatKey } from '@/core/types';
import { IdleDirector } from '@/pet/IdleDirector';
import { MoodResolver } from '@/pet/MoodResolver';
import { PetAnimator } from '@/pet/PetAnimator';
import { PetRig, type BoneKey } from '@/pet/PetRig';
import { SLEEP_ANGLE, SLEEP_HEAD_TILT, sleepRoot } from '@/pet/sleepPose';
import { DESIGN_HEIGHT, PLACEMENTS } from '@/pet/PetArt';
import { adResultMessage } from '@/services/Ads';
import { MIC_PRE_PROMPT, VoiceMimic, voiceFailureMessage } from '@/services/VoiceMimic';
import { ActionTray, type TrayItem } from '@/ui/ActionTray';
import { BUTTON_HEIGHT, Button } from '@/ui/Button';
import { Hud } from '@/ui/Hud';
import { MeterBar } from '@/ui/MeterBar';
import { NavBar } from '@/ui/NavBar';
import { captureRegion, drawCard } from '@/ui/photoCard';
import { buildDecor } from '@/scenes/decorArt';
import { SpeechBubble } from '@/ui/SpeechBubble';
import { Chatter, type Occasion } from '@/pet/chatter';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { drawIcon, type IconName } from '@/ui/icons';
import { DEPTH, FONT_BODY, FONT_DISPLAY, RADIUS, roomColumn, uiColumn } from '@/ui/theme';
import {
  bakeStatic,
  bedGeometry,
  buildBlanket,
  buildRoomLayers,
  buildDeposit,
  buildPuddle,
  buildTableFront,
  buildTubFront,
  litterSpot,
  tableGeometry,
  type RoomGeometry,
} from '@/scenes/rooms';
import { SCENE } from '@/scenes/keys';
import { setNames, t, type MessageKey } from '@/i18n';
import { wearableName } from '@/i18n/content';
import { NAME_MAX_LENGTH, cleanName } from '@/core/SaveManager';
import { openNameDialog } from '@/ui/nameDialog';
import { FeedSession } from '@/pet/FeedSession';
import { BathSession } from '@/pet/BathSession';
import { TOOLS, type ToolId } from '@/pet/BathArt';
import { Grime, type Contact } from '@/pet/Grime';
import { CALM, forgive, isCross, touch, type Temper } from '@/pet/temper';
import { BATH_PET_RISE } from '@/scenes/bathLayout';
import { FOOD_LIFT, TABLE_PET_RISE } from '@/scenes/tableLayout';
import { DEPOSIT, LOO_PET_RISE, looGeometry, stepAsideX } from '@/scenes/looLayout';
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

/** What floats up when she is patted. Keys, so they go through the catalogue. */
const PET_WORDS = [
  'home.float.pet1',
  'home.float.pet2',
  'home.float.pet3',
  'home.float.pet4',
] as const;

/** Top of the right-hand button column. The tutorial spotlights this spot. */
const TASKS_BUTTON_Y = 74;
/**
 * Vertical pitch of the right-hand rail.
 *
 * 74: a 52px face, a 18px label pill under it, and a gap. It was 62 with no
 * label, which is exactly why there was no label — there was nowhere to put
 * one, so the rail stayed the only unlabelled control group in the game.
 */
const RAIL_PITCH = 74;

/**
 * Where she is and what she is doing with her body.
 *
 * One name for the four mutually exclusive placements, because every one of
 * them has to undo the other three — see `placePet`.
 */
type Posture = 'sleep' | 'bath' | 'table' | 'loo' | 'stand';

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
  private photoButton!: Phaser.GameObjects.Container;
  private shopButton!: Phaser.GameObjects.Container;
  /**
   * The chosen rug, drawn live over the one `buildHome` bakes in.
   *
   * A container rather than the graphics itself, so swapping is empty-and-draw
   * and the room's baked texture is never touched — re-baking a room layer on
   * a shop tap is the thing this avoids.
   */
  private decorLayer!: Phaser.GameObjects.Container;
  /** Guards the capture: the chrome is hidden while it runs. */
  private shooting = false;
  private tasksButton!: Phaser.GameObjects.Container;
  private tasksBadge!: Phaser.GameObjects.Container;
  private zzzTimer: Phaser.Time.TimerEvent | null = null;
  private returnCard: Sheet | null = null;
  private micPrompt: Sheet | null = null;
  private micPromptAccepted = false;

  private petShadow!: Phaser.GameObjects.Graphics;
  private petHit!: Phaser.GameObjects.Rectangle;
  private blanket!: Phaser.GameObjects.Container;
  private tubFront!: Phaser.GameObjects.Container;
  private tableFront!: Phaser.GameObjects.Container;
  /** What is in the bowl, and the plate that gets rid of it. */
  private deposit: Phaser.GameObjects.Container | null = null;
  private flushHit!: Phaser.GameObjects.Rectangle;
  private flushTimer: Phaser.Time.TimerEvent | null = null;
  /** The litter tray's tap target, live only in the living room. */
  private litterHit!: Phaser.GameObjects.Rectangle;
  /** The accident on the floor, or null. One at a time — see `RELIEF`. */
  private puddle: Phaser.GameObjects.Container | null = null;
  /** The speech bubble she asks with. Built once, shown when she needs to go. */
  private askBubble!: Phaser.GameObjects.Container;
  private speech!: SpeechBubble;
  /**
   * Her opinions. Not in the save: a cat who remembers across a reinstall that
   * she last used line 3 is not a feature, and Phaser reuses scene instances,
   * so the timings are reset in `create` rather than initialised here.
   */
  private readonly chatter = new Chatter();
  /** Feeds the 'return' pool. Set by the return card, zero on a cold start. */
  private lastAwayHours = 0;
  /** Last outfit seen, so the inventory event can tell a change from a repaint. */
  private wornOutfit: string | null = null;
  private askTween: Phaser.Tweens.Tween | null = null;
  private roomGeo: RoomGeometry = { width: 0, height: 0, floorY: 0 };
  /** Where the rig sits standing and lying, worked out once at build time. */
  private standPose = { x: 0, y: 0 };
  private sleepPose = { x: 0, y: 0 };
  /** The rig's resting scale. Not read off the root — animations tween that. */
  private petScale = 1;
  private bathPose = { x: 0, y: 0 };
  private tablePose = { x: 0, y: 0 };
  private looPose = { x: 0, y: 0 };
  /** Which pose is on screen. `null` until the first one is placed. */
  private posedAs: Posture | null = null;

  /** How much poking she has taken lately. See `src/pet/temper.ts`. */
  private temper: Temper = CALM;
  private crossTimer: Phaser.Time.TimerEvent | null = null;

  private grime!: Grime;
  private bathing: BathSession | null = null;
  private bathingId: string | null = null;
  /** Toothbrush rubs banked this bath, for the one-off minty bonus. */
  private toothRubs = 0;

  private currentRoom: RoomKey = 'home';
  /**
   * The centred column the controls live in. On a phone it IS the canvas; on a
   * wide screen the room fills the canvas and this stays readable in the middle.
   */
  private ui = { left: 0, width: 0 };
  private sceneHeight = 0;
  private feeding: FeedSession | null = null;
  private feedingId: string | null = null;
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
    this.feeding = null;
    this.feedingId = null;
    this.bathing = null;
    this.bathingId = null;
    this.toothRubs = 0;
    this.temper = CALM;
    this.crossTimer = null;
    this.currentRoom = 'home';
    this.posedAs = null;
    this.puddle = null;
    this.deposit = null;
    this.flushTimer = null;
    this.askTween = null;
    this.chatter.reset();
    this.lastAwayHours = 0;
    // Null here and seeded from the save in `buildPet`. This block runs BEFORE
    // `this.context` is assigned — reading state here threw on every boot.
    this.wornOutfit = null;
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
    /*
     * A cat who was asleep when the app closed opens in her bedroom, not in the
     * living room. Assigning `currentRoom` first keeps `selectRoom` from
     * treating it as a room CHANGE, which would play the door sound at boot and
     * — because leaving the bedroom wakes her — is the one path that could put
     * her to bed and immediately wake her again.
     */
    this.currentRoom = this.context.state.isSleeping ? 'bed' : 'home';
    this.selectRoom(this.currentRoom);
    this.refreshAll();

    this.idleDirector = new IdleDirector(this, this.animator);
    this.idleDirector.start();

    /*
     * The idle beat, offered every eight seconds and taken far less often.
     *
     * The pacing lives in `Chatter`, not here: this loop only asks. A 26s
     * cooldown plus a one-in-three roll when she has nothing to complain about
     * comes out at a line every minute or so when she is fine and every half
     * minute when she is not — which is the difference between a pet with
     * opinions and a pet with a speech impediment.
     */
    this.time.addEvent({
      delay: 8000,
      loop: true,
      callback: () => this.say('idle'),
    });

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
    this.roomGeo = {
      width: column.width,
      height: this.sceneHeight,
      floorY: this.sceneHeight * 0.7,
    };
    this.roomLayers = buildRoomLayers(this, this.roomGeo);
    for (const layer of this.roomLayers.values()) {
      this.sceneLayer.add(layer);
    }

    // The duvet is the one piece of furniture that goes in FRONT of the pet, so
    // it cannot live in a room layer. Same column, one depth above her.
    this.blanket = this.add
      .container(column.left, 0)
      .setDepth(DEPTH.pet + 1)
      .setAlpha(0)
      .setVisible(false);
    this.blanket.add(buildBlanket(this, this.roomGeo));

    // Same trick for the bath: the near wall of the tub has to be in front of
    // her or she is standing behind a bath rather than sitting in one.
    this.tubFront = this.add
      .container(column.left, 0)
      .setDepth(DEPTH.pet + 1)
      .setAlpha(0)
      .setVisible(false);
    this.tubFront.add(buildTubFront(this, this.roomGeo));

    // And once more for the kitchen table, which is the only way a
    // front-facing rig ends up sitting AT one rather than behind it.
    this.tableFront = this.add
      .container(column.left, 0)
      .setDepth(DEPTH.pet + 1)
      .setAlpha(0)
      .setVisible(false);
    this.tableFront.add(buildTableFront(this, this.roomGeo));

    /*
     * The rug sits on the ROOM's layer, not a front one: she stands on it, and
     * a rug drawn over the cat is a cat standing under a carpet.
     */
    this.decorLayer = this.add.container(column.left, 0).setDepth(DEPTH.props + 0.5);
    this.refreshDecor();

    /*
     * The lavatory pointedly does NOT get one, and that is the whole of its
     * design. Three versions of it had the seat's lip drawn across her hips on
     * this layer, and all three read as a cat standing inside the bowl: a body
     * with porcelain over it is a body BEHIND that porcelain, whatever the
     * height says. She perches on the near edge instead, with the fixture
     * entirely behind her. See `looLayout`.
     */
  }

  private buildPet(width: number): void {
    const scale = (this.sceneHeight * 0.55) / DESIGN_HEIGHT;
    const feetY = this.sceneHeight - 52;
    this.petScale = scale;
    this.standPose = { x: width / 2, y: feetY };
    this.bathPose = { x: width / 2, y: feetY - BATH_PET_RISE };
    this.tablePose = { x: width / 2, y: feetY - TABLE_PET_RISE };
    this.looPose = { x: width / 2, y: feetY - LOO_PET_RISE };
    this.sleepPose = this.poseOnBed(width, scale);

    this.petShadow = this.add.graphics().setDepth(DEPTH.petShadow);
    this.petShadow.fillStyle(PALETTE.ink, 0.16);
    this.petShadow.fillEllipse(width / 2, feetY + 6, 196 * scale, 30 * scale);

    this.rig = new PetRig(this, width / 2, feetY);
    this.rig.root.setScale(scale).setDepth(DEPTH.pet);
    this.rig.setAccessory(this.context.state.equipped.hat);
    this.rig.setOutfit(this.context.state.equipped.outfit);
    // Seeded, not left null: otherwise the first `inventory` event of the
    // session reads as a change and she compliments an outfit she woke up in.
    this.wornOutfit = this.context.state.equipped.outfit;

    this.animator = new PetAnimator(this, this.rig);
    this.moodResolver = new MoodResolver(this.rig);
    this.animator.setSleeping(this.context.state.isSleeping);
    // Dirt hangs off the rig's own bones, so it goes wherever she does.
    this.grime = new Grime(this, this.rig);
    this.grime.setClean(this.context.state.stat('clean'));

    // The pet itself is the biggest tap target in the game. It is a rectangle
    // rather than the rig's own bounds because the rig is a dozen containers
    // deep and its bounds change every frame she breathes.
    this.petHit = this.add
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
    this.petHit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onPetTapped());

    /*
     * The litter tray's tap target.
     *
     * A separate rectangle over the prop rather than making the prop itself
     * interactive: the living room is baked into one texture by `bakeStatic`,
     * so there is no per-prop object left to hit by the time the room is on
     * screen. Only live in the living room, where the tray is drawn.
     */
    const spot = litterSpot(this.roomGeo);
    const roomLeft = roomColumn(width).left;
    this.litterHit = this.add
      .rectangle(
        roomLeft + spot.centreX,
        spot.centreY - 6,
        spot.width + 26,
        spot.height + 44,
        0x000000,
        0,
      )
      .setDepth(DEPTH.props + 1)
      .setVisible(this.currentRoom === 'home')
      .setInteractive({ useHandCursor: true });
    this.litterHit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.useLitter());

    // The flush plate, on the cistern lid. Only live once there is something
    // to flush — a button that does nothing is worse than no button.
    const loo = looGeometry(this.roomGeo);
    this.flushHit = this.add
      .rectangle(roomLeft + loo.flushX, loo.lidTop + 10, 78, 48, 0x000000, 0)
      /*
       * ABOVE the pet's own tap target, which is why this is `pet + 2` and not
       * `props + 1`. Her hit rectangle is 211 wide and 345 tall centred on the
       * seat, and it swallows the whole cistern — at props+1 the plate was
       * under it and tapping the flush petted her instead.
       */
      .setDepth(DEPTH.pet + 2)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.flushHit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.flush());

    /*
     * The bubble she asks with.
     *
     * This is the whole UI for the toilet need. It gets NO meter and no nav
     * tab — see the note on `RELIEF` in `tuning.ts` — so a speech bubble over
     * her head is the only thing telling the player, and it has to be
     * unmissable without being a number they feel behind on.
     */
    this.askBubble = this.add.container(0, 0).setDepth(DEPTH.fx).setVisible(false);
    const bubble = this.add.graphics();
    bubble.fillStyle(PALETTE.cream, 1);
    bubble.lineStyle(5, PALETTE.ink, 1);
    bubble.fillRoundedRect(-34, -30, 68, 56, 16);
    bubble.strokeRoundedRect(-34, -30, 68, 56, 16);
    bubble.fillStyle(PALETTE.cream, 1);
    bubble.fillTriangle(-9, 24, 9, 24, 0, 40);
    bubble.lineStyle(5, PALETTE.ink, 1);
    bubble.lineBetween(-9, 25, 0, 40);
    bubble.lineBetween(9, 25, 0, 40);
    this.askBubble.add(bubble);
    this.askBubble.add(drawIcon(this, 'litter', 40, PALETTE.grapeLo).setPosition(0, -2));

    // The one she talks in. Below the ask bubble's depth is not an option —
    // they are never up together (see `say`) but the toilet ask outranks a
    // remark about the weather if a race ever puts them there.
    this.speech = new SpeechBubble(this).setDepth(DEPTH.fx - 1) as SpeechBubble;
  }

  /** Where the rig's root goes so her head lands on the pillow. */
  private poseOnBed(width: number, scale: number): { x: number; y: number } {
    const bed = bedGeometry(this.roomGeo);
    const column = roomColumn(width);
    return sleepRoot(
      { x: column.left + bed.headX, y: bed.headY },
      PLACEMENTS.head.y,
      scale,
    );
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
    this.tray = new ActionTray(this, this.ui.left, top + 88, this.ui.width, (id, at) =>
      this.onTrayPress(id, at),
    );
    this.tray.setDepth(DEPTH.dock);
    this.tray.setDragHandlers(
      (id, at) => this.onTrayDragStart(id, at),
      (x, y) => {
        this.feeding?.moveTo(x, y);
        this.bathing?.moveTo(x, y);
      },
      () => {
        this.feeding?.release();
        this.bathing?.release();
      },
    );

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

    /*
     * EVERY ONE OF THESE IS LABELLED, and until now none of them were.
     *
     * The nav bar says HOME, FOOD, BATH. The action tray says "Talk mimic",
     * "Pet +fun". This rail — four coloured circles with a glyph in each — said
     * nothing at all, so the one column in the game holding the tasks list, the
     * shop, the free coins and the camera was the only one a new player had to
     * guess at. A star is not a word.
     *
     * The pill under the ad button already existed for "+150"; this is that
     * pattern applied to all four, which is why the ad's own reward still reads
     * the same and `refreshAdButton` needs no change: the label IS the tag.
     */
    this.tasksButton = this.railButton(x, 0, PALETTE.mint, 'star', t('rail.tasks'), () =>
      this.openTasks(),
    );
    this.tasksBadge = this.buildBadge(x + 44, TASKS_BUTTON_Y + 4);

    this.shopButton = this.railButton(x, 1, PALETTE.grape, 'hat', t('rail.shop'), () =>
      this.openShop(),
    );

    // The reward is IN the label rather than under a second pill: two stacked
    // pills do not fit between buttons, and "Free +150" says both things.
    this.adButton = this.railButton(
      x,
      2,
      PALETTE.butter,
      'tv',
      t('rail.ad', { n: EARN.rewardedAdCoins }),
      () => {
        void this.watchAd();
      },
    );

    /*
     * The camera. On the rail rather than in the action tray because the tray
     * is chores — everything in it changes a stat — and this changes nothing
     * about her.
     */
    this.photoButton = this.railButton(x, 3, PALETTE.pink, 'camera', t('rail.photo'), () => {
      void this.takePhoto();
    });

    /*
     * The ad button nudges every few seconds, the way the prototype's does.
     *
     * RELATIVE, and it was absolute — a hardcoded `y: 193`, five pixels above
     * where the button used to sit. Re-spacing the rail for labels moved it to
     * 222, so the same tween yanked it 29px upward on every nudge, over the
     * shop button and straight through the word "Shop". A nudge is "five
     * pixels from wherever you are", never "to this coordinate".
     */
    this.tweens.add({
      targets: this.adButton,
      y: this.adButton.y - 5,
      duration: 180,
      yoyo: true,
      repeat: -1,
      repeatDelay: 2400,
      ease: 'Sine.easeOut',
    });
  }

  /**
   * One rail button: the face, and the word underneath saying what it is.
   *
   * `slot` rather than a y, so the four cannot drift out of rhythm. The pitch
   * is a 52px face plus the label pill and a gap; the old spacing was 62 with
   * no room for a word at all, which is how the rail ended up unlabelled in
   * the first place.
   *
   * The label goes on the button's `tag` data because that is where
   * `refreshAdButton` already looks — hiding a button has to hide its word,
   * and one lookup is better than a parallel list to keep in step.
   */
  private railButton(
    x: number,
    slot: number,
    color: number,
    icon: IconName,
    label: string,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const y = TASKS_BUTTON_Y + slot * RAIL_PITCH;
    const button = this.roundButton(x, y, color, icon, onPress).setDepth(DEPTH.sideButtons);

    // The dark pill the prototype uses. White text alone is unreadable against
    // a pale wall, and these sit over the wall in every room.
    const tag = this.add.container(x + 26, y + 58).setDepth(DEPTH.sideButtons);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: FONT_DISPLAY,
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const pill = this.add.graphics();
    pill.fillStyle(PALETTE.ink, 0.92);
    pill.fillRoundedRect(-text.width / 2 - 8, -9, text.width + 16, 18, 9);
    tag.add([pill, text]);
    button.setData('tag', tag);
    return button;
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
      state.events.on('sleep', ({ isSleeping }) => {
        this.applySleepVisuals(isSleeping);
        this.refreshRelief();
        // Waking is the only occasion allowed through while she is asleep, and
        // by the time this fires she is not — the flag has already flipped.
        if (!isSleeping) this.time.delayedCall(800, () => this.say('woke'));
        else this.speech.hide();
      }),
      state.events.on('relief', () => this.refreshRelief()),
      state.events.on('mess', () => {
        this.refreshMess();
        this.refreshRelief();
      }),
      state.events.on('inventory', ({ equipped }) => {
        const changed = equipped.outfit !== this.wornOutfit;
        this.wornOutfit = equipped.outfit;
        this.rig.setAccessory(equipped.hat);
        this.rig.setOutfit(equipped.outfit);
        /*
         * Only when the OUTFIT changed, and only after the wardrobe closes.
         * This event also fires on buying a hat and on the first paint, and
         * `say` is suppressed while a sheet is up anyway — so without the
         * delay she reacts to a new dress in silence and then, once the sheet
         * is gone, to nothing at all.
         */
        this.refreshDecor();
        if (changed && equipped.outfit) {
          const name = wearableName('outfit', equipped.outfit, equipped.outfit);
          this.time.delayedCall(650, () => this.say('dressed', name));
        }
      }),

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
      this.context.awards.events.on('changed', () => this.refreshTasksBadge()),
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
    // Read-and-clear rather than an event: a scene mid-restart cannot miss it
    // and cannot see it twice.
    if (this.context.stats.takeAccident()) this.haveAccident();
    // The bubble follows her. It has to be per-frame rather than on the room
    // change, because `placePet` TWEENS her across over 620ms and a one-shot
    // reposition would put the bubble where she used to be for half a second.
    if (this.askBubble.visible) this.positionAskBubble();
  }

  /* ------------------------------ rooms ------------------------------ */

  private selectRoom(key: RoomKey): void {
    if (key === 'play') {
      this.openMiniGame();
      return;
    }
    /*
     * Same shape as `play`: a tab that opens something and returns, leaving
     * the bar showing the room she is actually standing in. Selecting it would
     * light a tab for a place that does not exist and strand the highlight
     * there once the sheet closed.
     */
    if (key === 'style') {
      this.openShop('outfit');
      return;
    }

    if (this.currentRoom !== key) {
      this.context.audio.play('room');
      // Leaving the bedroom wakes the pet — the lights are on elsewhere.
      if (this.context.state.isSleeping && key !== 'bed') {
        this.context.state.setSleeping(false);
      }
      // A morsel or a brush in mid-air belongs to the room it came out of.
      this.feeding?.destroy();
      this.bathing?.destroy();
    }

    this.currentRoom = key;
    this.navBar.selectRoom(key);
    this.fade(this.tubFront, key === 'bath');
    this.fade(this.tableFront, key === 'kitchen');
    this.litterHit.setVisible(key === 'home');
    this.decorLayer.setVisible(key === 'home');
    // A meal in mid-air belongs to the room it came from, and so does this.
    if (key !== 'loo') this.clearDeposit();
    this.refreshMess();
    this.placePet();
    this.refreshRelief();

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

  /**
   * Cross-fade one of the layers that sits IN FRONT of the pet.
   *
   * `visible` rather than alpha 0 at the end, because an invisible layer still
   * costs a render pass and there are two of these now.
   */
  private fade(layer: Phaser.GameObjects.Container, show: boolean): void {
    this.tweens.killTweensOf(layer);
    if (show) layer.setVisible(true);
    this.tweens.add({
      targets: layer,
      alpha: show ? 1 : 0,
      duration: 400,
      ease: 'Sine.easeInOut',
      onComplete: () => layer.setVisible(show),
    });
  }

  /* ----------------------------- actions ----------------------------- */

  private onTrayPress(id: string, at: { x: number; y: number }): void {
    if (id === 'pet') return this.onPetTapped();
    if (id === 'voice') return void this.onVoicePressed();
    if (id === 'sleep') return this.onSleepToggle();
    if (id === 'litter') return this.useLitter();
    /*
     * Food and bath tools are not tapped, they are DRAGGED — see
     * `onTrayDragStart`. A tap says so rather than doing nothing, which is what
     * a dead-feeling button looks like from the other side of the screen.
     */
    void at;
    if (id.startsWith('food:')) this.toast.show(t('home.toast.dragFood'));
    if (id.startsWith('bath:')) this.toast.show(this.bathHint());
  }

  /**
   * A touch. Whether it was a pat or a smack is decided by `temper`, not here.
   *
   * The gentle case is unchanged and must stay that way: a tap with a pause
   * around it is affection, pays fun, and is the free way to keep her happy.
   * What is new is that hammering on her is no longer the same thing repeated.
   */
  private onPetTapped(): void {
    if (this.overlayOpen) return;
    if (this.context.state.isSleeping) {
      // A tap on a sleeping pet wakes it rather than doing nothing.
      this.onSleepToggle();
      return;
    }

    const { state } = this.context;
    const result = touch(this.temper, this.time.now);
    this.temper = result.temper;
    this.idleDirector.noteTouch();

    if (result.reaction === 'pat') {
      this.context.audio.play('tap');
      state.addStat('fun', PET_FUN_GAIN);
      this.context.progression.award('pet');
      this.animator.play('squash');
      this.floatText(t(PET_WORDS[Phaser.Math.Between(0, PET_WORDS.length - 1)] ?? 'home.float.pet2'), '#ff9fb0');
      return;
    }

    // No fun, either way. She is not enjoying this and the meter says so.
    this.animator.play('flinch');
    this.context.audio.play('denied');

    if (result.reaction === 'cross') {
      state.addStat('fun', -TEMPER.funLoss);
      this.toast.show(t('home.toast.cross'));
      analytics.track('pet_cross', { level: state.level });
      // Come back to herself on a timer, whatever the player does next — a pet
      // you can put into a state and not get out of is a broken pet.
      this.crossTimer?.remove();
      this.crossTimer = this.time.delayedCall(TEMPER.sulkMs, () => {
        this.temper = forgive(this.temper);
        this.crossTimer = null;
        this.refreshStats();
      });
    } else {
      this.floatText(t('home.float.ouch'), '#c9739a');
    }
    this.refreshStats();
  }

  /**
   * Food and bath tools are draggable; everything else stays a plain button, so
   * a wobbly finger on Sleep cannot arm a session.
   */
  private onTrayDragStart(id: string, at: { x: number; y: number }): boolean {
    // Litter and sleep are TAPS. Returning false here is what stops a wobbly
    // finger on either of them arming a drag session that has nowhere to go.
    if (id === 'litter') return false;
    if (id.startsWith('bath:')) return this.onBathDragStart(id, at);
    if (!id.startsWith('food:')) return false;
    const food = FOODS.find((f) => f.id === id.slice('food:'.length));
    if (!food || !this.context.progression.isLevelReached(food.unlockLevel)) return false;

    /*
     * RESUME rather than refuse. An item is three bites, and what is left flies
     * back to the tray between them — so the second and third drags start on a
     * tile that already has a session. Treating that as "one is already in
     * flight" made bites two and three impossible: the food sat on the tray and
     * would not move again.
     */
    if (this.feeding) return this.feedingId === id;

    this.feedingId = id;
    this.onFeed(food, at);
    return this.feeding !== null;
  }

  /**
   * Hand feeding. Pressing a food tile and pulling it to her mouth is one
   * gesture; the tray drives it and this owns what happens at the other end.
   *
   * Payment happens on the FIRST BITE, not on pickup. Picking something up and
   * changing your mind must be free, or the tray becomes a thing players are
   * afraid to touch; but once she has actually eaten some of it, it is bought.
   */
  private onFeed(food: FoodDef, from: { x: number; y: number }): void {
    const { state, economy, progression } = this.context;
    if (state.isSleeping) {
      this.toast.show(t('home.toast.asleep'));
      return;
    }
    if (state.stat('hunger') > 94) {
      this.toast.show(t('home.toast.full'));
      return;
    }
    // One morsel in the air at a time, or two drags share one payment.
    if (this.feeding) return;
    if (!economy.canAfford(food.cost)) {
      this.context.audio.play('denied');
      this.toast.show(t('common.toast.notEnoughCoins'));
      return;
    }

    this.idleDirector.noteTouch();
    let paid = false;

    this.feeding = new FeedSession({
      scene: this,
      rig: this.rig,
      animator: this.animator,
      foodId: food.id,
      from,
      ...(this.currentRoom === 'kitchen' ? { restAt: this.platePoint() } : {}),
      depth: DEPTH.sheet - 1,
      onBite: (index) => {
        if (!paid) {
          // Checked again: coins can have moved between pickup and first bite.
          if (!economy.spend(food.cost, 'food')) {
            this.feeding?.destroy();
            return;
          }
          paid = true;
          analytics.track('fed', { food: food.id, cost: food.cost, level: state.level });
        }
        this.context.audio.play('eat');
        // Split across the bites, so a half-eaten meal is half a meal.
        state.addStat('hunger', food.hunger / FEEDING.bites);
        if (food.fun) state.addStat('fun', food.fun / FEEDING.bites);
        void index;
      },
      onFinished: () => {
        this.feeding = null;
        this.feedingId = null;
        // Food settles it early. Being fed by the person who annoyed you is
        // the apology this game has available.
        this.temper = forgive(this.temper);
        this.crossTimer?.remove();
        this.crossTimer = null;
        state.addStat('clean', -FEED_CLEAN_PENALTY);
        progression.award('feed');
        this.animator.play('hop');
        this.floatText(t('home.float.yum'), '#e0685f');
        this.time.delayedCall(700, () => this.say('fed'));
        this.refreshAll();
      },
      onAbandoned: () => {
        this.feeding = null;
        this.feedingId = null;
        this.refreshAll();
      },
    });
  }

  /**
   * The middle of the plate, in scene space.
   *
   * The room layers are composed in their own centred column and shifted, so a
   * table coordinate is not a scene coordinate on any screen wider than the
   * column — a difference that is invisible on a phone and puts the food a
   * hundred pixels off the table on a tablet.
   */
  private platePoint(): { x: number; y: number } {
    const table = tableGeometry(this.roomGeo);
    const left = roomColumn(this.scale.gameSize.width).left;
    return { x: left + table.plateX, y: table.plateY - FOOD_LIFT };
  }

  /* --------------------------- the litter tray ----------------------- */

  /**
   * Take her to the tray.
   *
   * A TAP, not a drag, and the only thing in the game that answers this need.
   * Free, instant and always available — a need with no cheap answer is a
   * chore, and this one already costs the player their attention.
   */
  private useLitter(): void {
    const { state, progression, audio } = this.context;
    if (this.overlayOpen) return;
    if (state.isSleeping) {
      this.toast.show(t('home.toast.asleep'));
      return;
    }
    if (state.relief >= RELIEF.max) {
      this.toast.show(t('home.toast.noNeed'));
      return;
    }

    this.idleDirector.noteTouch();
    state.setRelief(RELIEF.max);
    audio.play('bubble');
    progression.award('litter');

    if (this.currentRoom === 'loo') {
      this.useToilet();
    } else {
      this.animator.play('hop');
      this.floatText(t('home.float.better'), '#a88bd8');
      this.puffOverTray();
    }
    this.refreshRelief();
  }

  /* ------------------------- the lavatory ---------------------------- */

  /**
   * The whole point of the room, in four beats: she strains, she gets down,
   * you see what she left, you flush it and she climbs back up.
   *
   * The middle two beats are the price of sitting on the FRONT edge. Perched
   * there she is between the camera and the bowl, so the bowl is behind her —
   * the two readings cannot both be had from one front-on view, and the owner
   * picked sitting properly over watching it happen. Getting down turns the
   * hole into the most visible thing on screen a beat later, which is the
   * payoff, and it costs one tween.
   */
  private useToilet(): void {
    if (this.deposit) return;

    // A beat of effort first. Nothing reads as "she went" if it is instant.
    this.animator.play('squash');
    this.floatText(t('home.float.relieved'), '#a88bd8');

    const loo = looGeometry(this.roomGeo);
    const left = roomColumn(this.scale.gameSize.width).left;
    const feetY = this.sceneHeight - 52;

    this.tweens.killTweensOf(this.rig.root);
    this.tweens.add({
      targets: this.rig.root,
      // Off to the side and back down onto the floor. Which side and how far
      // is `stepAsideX`, because "beside the pan" and "still on screen" are
      // nearly the same place on a phone and it got that wrong once already.
      x: left + stepAsideX(loo),
      y: feetY,
      delay: 420,
      duration: 520,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (this.currentRoom !== 'loo') return;
        this.petShadow.setAlpha(1);
        // Her tap target has to come with her, or petting her means tapping
        // the empty seat she is no longer on.
        this.petHit.setPosition(
          this.rig.root.x,
          this.rig.root.y - (DESIGN_HEIGHT * this.petScale) / 2,
        );
        this.dropDeposit(left + loo.centreX, loo.seatCY + DEPOSIT.offsetY);
      },
    });
  }

  private dropDeposit(x: number, y: number): void {
    if (this.deposit) return;
    const { audio } = this.context;

    /*
     * In front of the PET (14), at a half step.
     *
     * Not because anything of hers should cross the bowl — she is off to the
     * side by the time this exists — but because her TAIL sweeps out about
     * 150px on the far side of her, which from where she lands is exactly the
     * bowl. Behind her and the tail wipes across it; in front of her and
     * nothing can, at either screen width. Phaser sorts depths numerically, so
     * a half step is a whole answer.
     */
    const pile = buildDeposit(this, x, y - 26).setDepth(DEPTH.pet + 0.5);
    pile.setScale(0.5);
    this.deposit = pile;
    this.tweens.add({
      targets: pile,
      y,
      scale: 1,
      duration: 260,
      ease: 'Bounce.easeOut',
      onComplete: () => audio.play('bubble'),
    });

    // The plate now does something, and says so.
    this.flushHit.setVisible(true);
    this.toast.show(t('home.toast.flush'));
    // Nothing may get stuck. If they walk away, it clears itself.
    this.flushTimer?.remove();
    this.flushTimer = this.time.delayedCall(9000, () => this.flush());
  }

  /** Tap the plate, or wait. Either way the room ends up clean. */
  private flush(): void {
    const pile = this.deposit;
    if (!pile) return;
    this.deposit = null;
    this.flushTimer?.remove();
    this.flushTimer = null;
    this.flushHit.setVisible(false);

    this.context.audio.play('bubble');
    this.context.progression.award('tidy');
    this.tweens.add({
      targets: pile,
      angle: 420,
      scale: 0.15,
      y: pile.y + 26,
      alpha: 0,
      duration: 620,
      ease: 'Quad.easeIn',
      onComplete: () => {
        pile.destroy(true);
        /*
         * And back up onto the seat, AFTER it has gone rather than during.
         *
         * The pile is drawn in front of her, so a simultaneous return has the
         * last of it swirling across her face. `posedAs` is stale — she was
         * moved by hand, not by `placePet` — and clearing it is what lets the
         * loo pose be applied a second time.
         */
        if (this.currentRoom !== 'loo') return;
        this.posedAs = null;
        this.placePet();
      },
    });
  }

  /** Room change or scene teardown. Nothing may be left floating. */
  private clearDeposit(): void {
    this.flushTimer?.remove();
    this.flushTimer = null;
    this.flushHit.setVisible(false);
    this.deposit?.destroy(true);
    this.deposit = null;
  }

  /** A little dust off the tray, so the tap has a result you can see. */
  private puffOverTray(): void {
    const spot = litterSpot(this.roomGeo);
    const left = roomColumn(this.scale.gameSize.width).left;
    for (let i = 0; i < 7; i++) {
      const puff = this.add
        .circle(
          left + spot.centreX + Phaser.Math.Between(-30, 30),
          spot.top + 8,
          Phaser.Math.Between(4, 8),
          0xe8dcf8,
          0.9,
        )
        .setDepth(DEPTH.props + 2);
      this.tweens.add({
        targets: puff,
        y: puff.y - Phaser.Math.Between(24, 52),
        alpha: 0,
        scale: 1.6,
        duration: Phaser.Math.Between(420, 720),
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /**
   * Show or hide the bubble she asks with.
   *
   * Only while she is AWAKE and there is no mess already: a sleeping cat is
   * not asking for anything, and asking again next to a puddle she has already
   * made is nagging about something the player cannot fix by tapping the tray.
   */
  private refreshRelief(): void {
    const { state } = this.context;
    const asking =
      !state.isSleeping && state.messRoom === null && reliefState(state.relief) !== 'fine';

    /*
     * The LOO tab carries the dot, the way each stat's room does.
     *
     * This need has no meter, so the dot is doing work here that the dock does
     * for the other four: it is the one piece of always-on UI that says where
     * to go. Without it a player who misses the bubble has no trail at all.
     */
    this.navBar.setDot('loo', asking);

    if (!asking) {
      this.askTween?.remove();
      this.askTween = null;
    this.chatter.reset();
    this.lastAwayHours = 0;
    // Null here and seeded from the save in `buildPet`. This block runs BEFORE
    // `this.context` is assigned — reading state here threw on every boot.
    this.wornOutfit = null;
      this.askBubble.setVisible(false);
      return;
    }

    this.positionAskBubble();
    if (this.askBubble.visible) return;

    /*
     * The idle is a SCALE pulse, not a drift.
     *
     * A y-tween would fight `setPosition` — she moves between rooms and the
     * bubble has to follow, and a repeating tween holds its own start value,
     * so the bubble would spring back to wherever she was standing when it
     * began. Scale is orthogonal to position, so the two never argue.
     */
    this.askBubble.setVisible(true).setScale(0.6).setAlpha(0);
    this.tweens.add({
      targets: this.askBubble,
      alpha: 1,
      duration: 220,
    });
    this.askTween = this.tweens.add({
      targets: this.askBubble,
      scale: { from: 0.94, to: 1.08 },
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Over her shoulder — her ears are over her head, and in bed she is lying down. */
  private positionAskBubble(): void {
    const pose = this.rig.root;
    this.askBubble.setPosition(pose.x + 104 * this.petScale, pose.y - 300 * this.petScale);
  }

  /**
   * She could not wait.
   *
   * The clean penalty is chosen to push a typical cat under
   * `BATHING.showDirtBelow`, so the existing `Grime` system puts visible dirt
   * on her without a line of new code — the mess is on the floor AND on the
   * cat, which is what makes running a bath the obvious next thing.
   */
  private haveAccident(): void {
    const { state, audio } = this.context;
    if (state.messRoom !== null) return;

    /*
     * Not in the lavatory. She is sitting ON the thing — a puddle two inches
     * from the bowl is exactly the joke this room's whole design is built to
     * avoid, and it would punish a player who did the right thing and took her
     * there. She just goes. What they lose by not tapping is the XP and the
     * daily-task credit, which is cost enough.
     */
    if (this.currentRoom === 'loo') {
      state.setRelief(RELIEF.max);
      this.floatText(t('home.float.relieved'), '#a88bd8');
      this.refreshRelief();
      return;
    }

    state.setMess(this.currentRoom === 'play' ? 'home' : this.currentRoom);
    state.addStat('clean', -RELIEF.accidentCleanPenalty);
    state.setRelief(RELIEF.max);
    audio.play('denied');
    this.animator.play('flinch');
    this.toast.show(t('home.toast.accident'));
    analytics.track('accident', { room: state.messRoom ?? 'home', clean: state.stat('clean') });
    this.refreshMess();
    this.refreshRelief();
    this.refreshStats();
  }

  /** Put the puddle on the floor of the room it happened in, or take it away. */
  private refreshMess(): void {
    const { state } = this.context;
    const here = state.messRoom !== null && state.messRoom === this.currentRoom;

    if (!here) {
      this.puddle?.destroy(true);
      this.puddle = null;
      return;
    }
    if (this.puddle) return;

    const { width } = this.scale.gameSize;
    // Off to her left, clear of her tap target and of the litter tray.
    const puddle = buildPuddle(this, width / 2 - 128, this.sceneHeight - 44);
    puddle.setDepth(DEPTH.petShadow + 1);
    const hit = this.add
      .rectangle(0, 0, 110, 56, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.tidyUp());
    puddle.add(hit);
    this.puddle = puddle;
  }

  /**
   * Clear it up. One tap, deliberately cheap.
   *
   * The cost of an accident was the cleanliness and the fact that the room
   * looked bad — not the chore of removing it. Making this a scrub as well
   * would punish the same mistake twice.
   */
  private tidyUp(): void {
    const { state, progression, audio } = this.context;
    if (this.overlayOpen || state.messRoom === null) return;

    const at = this.puddle;
    state.setMess(null);
    progression.award('tidy');
    audio.play('bubble');

    if (at) {
      this.puddle = null;
      this.tweens.add({
        targets: at,
        alpha: 0,
        scale: 0.4,
        duration: 320,
        ease: 'Quad.easeIn',
        onComplete: () => at.destroy(true),
      });
    }
    this.refreshRelief();
  }

  /* ------------------------------ bathing ---------------------------- */

  /** What tapping a bath tool should say, given there is nothing to tap it for. */
  private bathHint(): string {
    const { state } = this.context;
    if (state.isSleeping) return t('home.toast.asleep');
    if (this.grime.dirtLeft === 0 && state.stat('clean') >= 100) {
      return t('home.toast.alreadyClean');
    }
    return t('home.toast.dragTool');
  }

  /**
   * Pick up a bath tool. Same one-gesture rule as the food: press the tile and
   * pull it onto her.
   *
   * Nothing is paid for and nothing can be wasted, so unlike feeding there is
   * no reason to refuse the pickup — the only guard is that she has to be
   * awake, which is what the tap on the tile says.
   */
  private onBathDragStart(id: string, at: { x: number; y: number }): boolean {
    const tool = id.slice('bath:'.length) as ToolId;
    if (!(tool in TOOLS)) return false;
    if (this.context.state.isSleeping) return false;
    if (this.bathing) return this.bathingId === id;

    this.idleDirector.noteTouch();
    this.bathingId = id;
    // Her mouth opens for the toothbrush and nothing else. It is the only tool
    // with a target you cannot see until you pick it up.
    if (tool === 'tooth') this.grime.showTeeth(true);
    this.bathing = new BathSession({
      scene: this,
      grime: this.grime,
      tool,
      from: at,
      depth: DEPTH.sheet - 1,
      onRub: (where, point) => this.onRub(tool, where, point),
      onFinished: () => {
        this.bathing = null;
        this.bathingId = null;
        this.grime.showTeeth(false);
        this.refreshAll();
      },
    });
    return true;
  }

  /**
   * One rub landed.
   *
   * Cleanliness is credited per rub rather than in a lump at the end, so a bath
   * abandoned halfway still counts for exactly as much as was actually done —
   * the same rule hand feeding uses, and the reason neither can be "wasted".
   */
  private onRub(tool: ToolId, where: Exclude<Contact, null>, at: { x: number; y: number }): void {
    const { state } = this.context;
    const session = this.bathing;

    if (tool === 'tooth') {
      // The toothbrush has one target and it is not her back.
      if (where !== 'mouth') return;
      this.toothRubs += 1;
      session?.sparkle(at, PALETTE.mint);
      this.context.audio.play('bubble');
      // The plaque fades with the rubs, so the last one is the one that
      // finishes it rather than the one that happens to hit a counter.
      this.grime.brushTeeth(this.toothRubs / BATHING.toothRubs);
      if (this.toothRubs === BATHING.toothRubs) {
        state.addStat('fun', BATHING.toothFun);
        this.floatText(t('home.float.minty'), '#7fd9b8');
      }
      return;
    }

    if (tool === 'rinse') {
      this.rinse(at);
      return;
    }

    if (tool === 'soap') {
      this.grime.lather(at.x, at.y);
      this.grime.scrubAt(at.x, at.y, BATHING.soapScrub);
      state.addStat('clean', BATHING.soapClean);
      session?.sparkle(at);
    } else {
      const lifted = this.grime.scrubAt(at.x, at.y);
      state.addStat('clean', BATHING.brushClean);
      session?.sparkle(at, lifted ? PALETTE.sky : PALETTE.white);
      if (lifted) this.context.audio.play('bubble');
    }
    this.refreshStats();
  }

  /**
   * The shower head, passed over her.
   *
   * This ENDS the bath, and it ends it wherever the player got to: the top-up
   * and the "squeaky" only land if the dirt is actually gone. Rinsing a filthy
   * cat washes the soap off a filthy cat, which is both correct and the reason
   * there is no failure state to design around.
   */
  private rinse(at: { x: number; y: number }): void {
    const { state, progression } = this.context;
    const wasDirty = this.grime.dirtLeft > 0;

    this.spawnDrops(at);
    this.context.audio.play('bubble');
    /*
     * THERE HAS TO BE SOAP ON HER. Without this the shower head is a free +26
     * cleanliness and an XP award for waving a finger over a dry cat, which is
     * the old tap-to-scrub button with a nicer sprite. Lathering her again costs
     * a full pass with the soap, so the bonus cannot be farmed.
     */
    if (this.grime.foamCount === 0) return;

    this.grime.rinse();
    state.addStat('clean', BATHING.rinseClean);
    progression.award('scrub');
    this.toothRubs = 0;
    analytics.track('bathed', { clean: Math.round(state.stat('clean')), dirty: wasDirty });

    if (!wasDirty) {
      this.animator.play('hop');
      this.spawnBubbles(7);
      this.floatText(t('home.float.squeaky'), '#6ec5e9');
      this.time.delayedCall(700, () => this.say('washed'));
    }
    this.refreshAll();
  }

  /** Water off the shower head. */
  private spawnDrops(at: { x: number; y: number }): void {
    for (let i = 0; i < BATHING.drops; i++) {
      const drop = this.add
        .ellipse(
          at.x + Phaser.Math.Between(-42, 42),
          at.y,
          Phaser.Math.Between(4, 7),
          Phaser.Math.Between(10, 16),
          0x8fd8f2,
          0.9,
        )
        .setDepth(DEPTH.sheet - 2);
      this.tweens.add({
        targets: drop,
        y: drop.y + Phaser.Math.Between(90, 170),
        alpha: 0,
        delay: i * 22,
        duration: BATHING.dropMs,
        ease: 'Quad.easeIn',
        onComplete: () => drop.destroy(),
      });
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
      this.context.awards.record('sleep');
      this.toast.show(t('home.toast.lightsOut'));
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

  /**
   * Redraw the rug from the save, and show it only in the living room.
   *
   * ABOVE `DEPTH.props`, not below it. The room layers are children of
   * `sceneLayer`, which is itself at `DEPTH.props` — so `props - 1` put the rug
   * behind the entire baked room and the default pink one simply covered it.
   * A half step over it is the only place it can go, and it is safe: the whole
   * room is one baked texture, so there is no getting between the floorboards
   * and the plant, and nothing needs to be. The plant is bottom-LEFT of the
   * rug and the litter tray sits 2px above its top edge; the only thing the
   * rug can reach is floor.
   *
   * Position and size come from `buildHome`'s own rug so the replacement lands
   * on the original rather than beside it — the baked one is still there
   * underneath, and any rug that did not cover it would show a pink halo.
   */
  private refreshDecor(): void {
    this.decorLayer.removeAll(true);
    this.decorLayer.setVisible(this.currentRoom === 'home');
    const id = this.context.state.equipped.decor;
    if (!id) return;
    const g = buildDecor(this, id, Math.round(this.roomGeo.width / 2), this.roomGeo.height - 40);
    if (g) this.decorLayer.add(g);
  }

  /* ---------------------------- her opinions -------------------------- */

  /**
   * Offer her an occasion. She usually declines — see `chatter.ts`.
   *
   * Four things suppress a line outright, before the cooldowns get a vote:
   * a sheet is up (she would be talking to the back of it), she is asleep
   * (except for waking), she is mid-mini-game, or the toilet ask is on screen.
   * That last one is the important one: the ask bubble and this bubble occupy
   * the same patch of air above her head, and the ask is the only speech in
   * the game the player is required to act on.
   */
  private say(occasion: Occasion, outfitName?: string): void {
    if (this.overlayOpen || this.shooting) return;
    if (this.askBubble.visible) return;
    if (this.context.state.isSleeping && occasion !== 'woke') return;

    const line = this.chatter.pick({
      occasion,
      stats: this.context.state.stats,
      hoursAway: this.lastAwayHours,
      outfitName,
      nowMs: this.time.now,
    });
    if (!line) return;

    const text = t(line.key as MessageKey, line.params);
    const pose = this.posedAs === 'sleep' ? this.sleepPose : this.rig.root;
    this.speech.say(
      text,
      { x: pose.x + 92 * this.petScale, y: pose.y - 300 * this.petScale },
      Math.min(5200, 2200 + text.length * 55),
      // The rail, not the canvas — see `SpeechBubble.say`. Matches the x the
      // side buttons are built at in `buildSideButtons`.
      this.ui.left + this.ui.width - 66,
    );
  }

  /* ------------------------------ photo ------------------------------ */

  /**
   * Photograph the room and hand it to the share sheet.
   *
   * THE CHROME COMES OFF FIRST. The capture region is the room, and the HUD,
   * the side rail and her speech bubble all live inside it — a screenshot with
   * a coin counter and a rewarded-video button in the corner is a bug report,
   * not a photo of a cat. They go back in a `finally`, because a capture that
   * throws with the interface switched off leaves an unplayable game.
   *
   * THE FLASH COMES AFTER. It would otherwise be in the picture: `snapshotArea`
   * captures the next rendered frame, not the current one, so anything added
   * before it lands is captured too. One or two frames later is still
   * immediate to a human, and it doubles as the signal that the shot is taken.
   */
  private async takePhoto(): Promise<void> {
    if (this.shooting || this.overlayOpen) return;
    this.shooting = true;
    const { sharing, state, economy, clock, audio } = this.context;

    const chrome: Phaser.GameObjects.Container[] = [
      this.hud,
      this.tasksButton,
      this.tasksBadge,
      this.shopButton,
      this.adButton,
      this.photoButton,
      this.askBubble,
    ];
    // Every rail button carries its own label now, so the photo has to take
    // all four off — not just the ad's, which was the only one that existed.
    for (const button of [this.tasksButton, this.shopButton, this.adButton, this.photoButton]) {
      const tag = button.getData('tag') as Phaser.GameObjects.Container | undefined;
      if (tag) chrome.push(tag);
    }
    // Only the ones that were ON go back on. Blanket-restoring would light the
    // ad tag, the tasks badge and her bubble for players who had none of them.
    const wasVisible = chrome.map((o) => o.visible);
    const restore = () => {
      for (const [i, o] of chrome.entries()) o.setVisible(wasVisible[i] ?? true);
    };

    try {
      for (const o of chrome) o.setVisible(false);
      const image = await this.snapshotRoom();
      restore();
      this.flash();
      audio.play('bubble');
      if (!image) {
        this.toast.show(t('photo.toast.failed'));
        return;
      }

      const card = drawCard(
        image,
        { name: state.petName || 'Biskit', caption: t('photo.caption') },
        (w, h) => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          return c;
        },
      );
      const blob = await new Promise<Blob | null>((resolve) => card.toBlob(resolve, 'image/png'));
      if (!blob) {
        this.toast.show(t('photo.toast.failed'));
        return;
      }

      const outcome = await sharing.share({
        blob,
        filename: `biskit-${state.petName || 'cat'}.png`.toLowerCase().replace(/\s+/g, '-'),
        text: t('photo.share.text', { pet: state.petName || 'Biskit' }),
        url: 'https://biskit.fun',
      });

      // A download IS the share on a desktop browser, so it pays out too. A
      // cancel does not: backing out of the sheet is not sharing, and paying
      // for it would make the bonus a button you tap and dismiss for coins.
      if (outcome === 'shared' || outcome === 'downloaded') {
        const first = state.claimPhotoBonus(clock.localDayKey(clock.now()));
        if (first) economy.earn(PHOTO.dailyCoinBonus, 'photo');
        /*
         * Every share counts toward the ladder, not just the first of the day.
         * Reported explicitly because sharing awards no XP, so there is no
         * `xpGained` for `Awards` to overhear — the same reason `sleep` is
         * reported by hand.
         */
        this.context.awards.record('photo');
        this.toast.show(
          first
            ? t('photo.toast.bonus', { coins: PHOTO.dailyCoinBonus })
            : t(outcome === 'shared' ? 'photo.toast.shared' : 'photo.toast.saved'),
        );
        this.refreshAll();
      } else if (outcome === 'unsupported') {
        this.toast.show(t('photo.toast.unsupported'));
      } else if (outcome === 'failed') {
        this.toast.show(t('photo.toast.failed'));
      }
    } finally {
      // Belt and braces: if anything after the capture threw, the restore
      // above never ran and the game is left with no interface.
      restore();
      this.shooting = false;
    }
  }

  /**
   * One frame of the room, cropped to the card's shape.
   *
   * Resolves null rather than rejecting on a renderer that hands back a colour
   * instead of an image — `snapshotArea` is typed to do either, and the pixel
   * form is what you get from `snapshotPixel`, so it should not happen here.
   * The timeout is the real guard: the callback fires from inside the render
   * loop, and a scene that is not rendering (a backgrounded tab) never fires
   * it at all, which would leave the interface hidden forever.
   */
  private snapshotRoom(): Promise<HTMLImageElement | null> {
    const region = captureRegion(this.scale.gameSize.width, this.sceneHeight);
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: HTMLImageElement | null) => {
        if (done) return;
        done = true;
        resolve(value);
      };
      this.time.delayedCall(PHOTO.captureTimeoutMs, () => finish(null));
      this.game.renderer.snapshotArea(region.x, region.y, region.width, region.height, (result) => {
        finish(result instanceof HTMLImageElement ? result : null);
      });
    });
  }

  /** The white blink. Over the room only — the dock is not in the picture. */
  private flash(): void {
    const sheet = this.add
      .rectangle(0, 0, this.scale.gameSize.width, this.sceneHeight, 0xffffff, 0.85)
      .setOrigin(0, 0)
      .setDepth(DEPTH.sceneOverlay + 1);
    this.tweens.add({
      targets: sheet,
      alpha: 0,
      duration: PHOTO.flashMs,
      ease: 'Quad.easeOut',
      onComplete: () => sheet.destroy(),
    });
  }

  /* ---------------------------- overlays ----------------------------- */

  /** `tab` picks which rack opens. The hat button wants hats, STYLE wants clothes. */
  private openShop(tab: WearSlot = 'hat'): void {
    if (this.overlayOpen) return;
    this.overlayOpen = true;
    this.idleDirector.setPaused(true);
    this.scene.launch(SCENE.shop, { tab });
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
    /*
     * Both lists, one badge. The button opens a sheet with two tabs and the
     * badge is the only thing that says there is anything in either — counting
     * only the daily side would leave a claimable milestone invisible until
     * the player happened to open the sheet and switch tabs.
     */
    const claimable =
      this.context.tasks.claimableCount + this.context.awards.claimableCount;
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
    /*
     * `isLevelReached`, not `isUnlocked('secondMiniGame')`.
     *
     * They differ now: `isUnlocked` is the raw level check the monetisation
     * gate needs, and `isLevelReached` is the CONTENT gate, which
     * `CONTENT_GATES.byLevel` turns off. Copycat is content, so it asks the
     * one that can be switched — the same call the shop and the food tray
     * make. `UNLOCK_LEVEL.secondMiniGame` still records the pacing it was
     * tuned for; flipping the switch back restores it.
     */
    const unlocked = this.context.progression.isLevelReached(UNLOCK_LEVEL.secondMiniGame);

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
          /*
           * She speaks AFTER the card, not instead of it. The card is the
           * ledger — four stats and what each did — and the line is the
           * opinion about it, which is the half the landing page actually
           * promises. Said while the sheet was up, the bubble would be behind
           * it, and `say` suppresses itself for exactly that reason.
           */
          this.time.delayedCall(520, () => this.say('return'));
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

    /*
     * The toilet need, as a SENTENCE rather than a delta.
     *
     * Every other line on this card is "hunger -57". A signed number here
     * would re-teach the player that this is a meter after all, which is the
     * one thing the whole design is trying not to say — and "you failed at
     * -88" is a worse way to be greeted than "she could not hold it".
     */
    const reliefLine = report.accident
      ? t('return.accident')
      : reliefState(report.reliefAfter) !== 'fine'
        ? t('return.needsLitter')
        : null;
    if (reliefLine) {
      const icon = drawIcon(this, 'litter', 20, PALETTE.grapeLo, 2.4);
      icon.setPosition(34, y + 10);
      sheet.content.add(icon);
      sheet.content.add(
        this.add
          .text(56, y + 10, reliefLine, {
            fontFamily: FONT_BODY,
            fontSize: '12.5px',
            color: '#33243f',
            fontStyle: 'bold',
            wordWrap: { width: panel - 80 },
          })
          .setOrigin(0, 0.5),
      );
      y += 34;
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
    this.lastAwayHours = report.elapsedHours;
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
    this.refreshRelief();
    this.refreshMess();
    this.applySleepVisuals(state.isSleeping);
  }

  private refreshStats(): void {
    const { state } = this.context;
    for (const key of STAT_KEYS) {
      const value = state.stat(key);
      this.meters.get(key)?.setValue(value, STAT_WARN_BELOW[key]);
      this.navBar.setDot(STAT_ROOM[key], value < STAT_WARN_BELOW[key]);
    }

    this.grime.setClean(state.stat('clean'));

    this.moodResolver.apply(state.stats, {
      isSleeping: state.isSleeping,
      isTalking: this.voice.currentState === 'playing',
      isEating: this.animator.isBusy && this.rig.mouth === 'open',
      isBathing: this.bathing !== null,
      isCross: isCross(this.temper, this.time.now),
      isDesperate: reliefState(state.relief) !== 'fine',
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
          /*
           * The litter tray, on the tray as well as on the floor.
           *
           * The prop in the corner is the one you find by looking; this is the
           * one you find by looking for a BUTTON, which is what a player who
           * has just seen a bubble over her head does. It is the only need in
           * the game with no meter, so it gets two ways in.
           */
          {
            id: 'litter',
            label: t('tray.litter.label'),
            caption: t('tray.litter.caption'),
            icon: 'litter',
          },
        ];
        break;
      case 'kitchen':
        /*
         * Locked food stays on the tray rather than being hidden — a player
         * who cannot SEE Sushi has no reason to want it. With
         * `CONTENT_GATES.byLevel` off nothing is locked and the caption is
         * always the price, but the branch stays: the switch is meant to be
         * reversible, and deleting the locked path would make flipping it back
         * a rewrite rather than a one-line change.
         */
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
      case 'loo':
        /*
         * One tile, and it does the same job the litter tray does. She is
         * already sitting on the thing; the tap is the player saying "go on".
         */
        items = [
          {
            id: 'litter',
            label: t('tray.toilet.label'),
            caption: t('tray.toilet.caption'),
            icon: 'loo',
          },
        ];
        break;
      case 'bath':
        items = [
          { id: 'bath:soap', label: t('tray.soap.label'), caption: t('tray.soap.caption'), icon: 'soap' },
          { id: 'bath:brush', label: t('tray.brush.label'), caption: t('tray.brush.caption'), icon: 'brush' },
          { id: 'bath:tooth', label: t('tray.tooth.label'), caption: t('tray.tooth.caption'), icon: 'tooth' },
          { id: 'bath:rinse', label: t('tray.rinse.label'), caption: t('tray.rinse.caption'), icon: 'shower' },
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

  /**
   * Everything that changes when she drops off: the lights, the pose, the bed.
   *
   * `refreshAll` calls this on every state change, so the pose work behind it
   * has to be a no-op when nothing moved — otherwise the tween restarts from
   * wherever it had got to each time a coin is spent.
   */
  private applySleepVisuals(isSleeping: boolean): void {
    if (this.animator.isSleeping !== isSleeping) {
      this.animator.setSleeping(isSleeping);
      this.tweens.add({
        targets: this.nightOverlay,
        alpha: isSleeping ? 0.55 : 0,
        duration: 600,
        ease: 'Sine.easeInOut',
      });

      this.zzzTimer?.remove();
      this.zzzTimer = null;
      if (isSleeping) {
        this.zzzTimer = this.time.addEvent({
          delay: 700,
          loop: true,
          callback: () => this.spawnZzz(),
        });
      }
    }
    this.placePet();
  }

  /** Under the blanket, so not drawn. See `placePet`. */
  private static readonly COVERED: readonly BoneKey[] = ['tail', 'armL', 'armR', 'legL', 'legR'];

  /** Which of the three she is in. Drives the pose and everything around it. */
  private posture(): Posture {
    if (this.context.state.isSleeping) return 'sleep';
    if (this.currentRoom === 'bath') return 'bath';
    if (this.currentRoom === 'loo') return 'loo';
    return this.currentRoom === 'kitchen' ? 'table' : 'stand';
  }

  /**
   * Put her where the room and her state say she goes.
   *
   * Three placements, one function, because they are mutually exclusive and
   * every one of them has to undo the other two. Split across the room switch
   * and the sleep handler they drifted immediately: walking out of the bathroom
   * while asleep is reachable, and it needs the tub layer, the blanket, the
   * shadow, the limbs and the tap target all to agree afterwards.
   *
   * The LIMBS come off for sleep rather than being covered. Tipped on her side
   * the rig fans its two arms, two legs and tail out in four directions at once
   * — the tail ends up above her own ear — and a blanket laid over that hides
   * some of it and slices the rest in half. A cat under a blanket has no limbs
   * showing, so there is nothing to hide; the one paw over the top is drawn on
   * the blanket, where it can be placed properly. They go at the END of lying
   * down and come back at the START of getting up, so the limbs are never
   * missing from a cat the player can still see moving.
   */
  private placePet(): void {
    const posture = this.posture();
    if (this.posedAs === posture) return;
    const settling = this.posedAs !== null;
    this.posedAs = posture;

    const sleeping = posture === 'sleep';
    const pose = {
      sleep: this.sleepPose,
      bath: this.bathPose,
      table: this.tablePose,
      loo: this.looPose,
      stand: this.standPose,
    }[posture];
    const duration = settling ? 620 : 0;
    const setCovered = (visible: boolean) => {
      for (const bone of HomeScene.COVERED) this.rig.bone(bone).setVisible(visible);
    };
    // No floor shadow when there is no floor under her: she is on a mattress
    // or in a foot of water.
    const shadow = posture === 'stand' ? 1 : 0;

    this.tweens.killTweensOf(this.rig.root);
    const head = this.rig.bone('head');
    if (duration === 0) {
      this.rig.root.setPosition(pose.x, pose.y).setAngle(sleeping ? SLEEP_ANGLE : 0);
      head.setAngle(sleeping ? SLEEP_HEAD_TILT : 0);
      this.petShadow.setAlpha(shadow);
      this.blanket.setAlpha(sleeping ? 1 : 0).setVisible(sleeping);
      setCovered(!sleeping);
    } else {
      if (!sleeping) setCovered(true);
      this.tweens.add({
        targets: this.rig.root,
        x: pose.x,
        y: pose.y,
        angle: sleeping ? SLEEP_ANGLE : 0,
        duration,
        ease: sleeping ? 'Sine.easeInOut' : 'Back.easeOut',
      });
      this.tweens.add({
        targets: head,
        angle: sleeping ? SLEEP_HEAD_TILT : 0,
        duration,
        ease: 'Sine.easeInOut',
      });
      this.tweens.add({ targets: this.petShadow, alpha: shadow, duration });
      if (sleeping) this.blanket.setVisible(true);
      this.tweens.add({
        targets: this.blanket,
        alpha: sleeping ? 1 : 0,
        duration,
        onComplete: () => {
          this.blanket.setVisible(sleeping);
          if (sleeping) setCovered(false);
        },
      });
    }

    // The tap target follows her. Asleep it covers the whole bed, so a tap
    // anywhere near her wakes her rather than only one directly on her ear.
    const scale = this.petScale;
    if (sleeping) {
      const bed = bedGeometry(this.roomGeo);
      const left = roomColumn(this.scale.gameSize.width).left;
      const top = bed.headY - 96;
      const bottom = bed.surfaceY + 44;
      this.petHit.setPosition(left + (bed.left + bed.right) / 2, (top + bottom) / 2);
      this.resizePetHit(bed.width, bottom - top);
    } else {
      this.petHit.setPosition(pose.x, pose.y - (DESIGN_HEIGHT * scale) / 2);
      this.resizePetHit(220 * scale, DESIGN_HEIGHT * scale);
    }
  }

  /**
   * Resize the tap target, hit area included.
   *
   * `setSize` alone moves the rectangle but not the input geometry Phaser
   * tested against when `setInteractive` ran, so the target would go on
   * answering taps at her standing position however far she had moved.
   */
  private resizePetHit(width: number, height: number): void {
    this.petHit.setSize(width, height);
    const area = this.petHit.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    area?.setTo(0, 0, width, height);
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
    // From her head, wherever it currently is — she is not always standing in
    // the middle of the room when she is asleep.
    const head = this.rig.bone('head').getWorldTransformMatrix();
    const z = this.add
      .text(head.tx + 54, head.ty - 62, 'z', {
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

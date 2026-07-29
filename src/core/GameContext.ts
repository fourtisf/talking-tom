/**
 * Composition root.
 *
 * One instance is built in `main.ts` and parked in Phaser's registry, so every
 * scene shares the same store, economy and save file. Scenes never construct
 * systems themselves — that is how you end up with two wallets.
 */

import type Phaser from 'phaser';

import { type Clock, clock } from '@/core/Clock';
import { Emitter } from '@/core/EventBus';
import { Economy } from '@/core/Economy';
import { type GameState, gameState } from '@/core/GameState';
import { Progression } from '@/core/Progression';
import { Tasks } from '@/core/Tasks';
import { SaveManager, validate } from '@/core/SaveManager';
import { CloudSave } from '@/core/CloudSave';
import { SYNC } from '@/config/tuning';
import { StatSystem } from '@/core/StatSystem';
import { audio, type AudioBus } from '@/core/Audio';
import { music, type MusicPlayer } from '@/core/Music';
import { PreferencesStore, type KeyValueStore } from '@/core/storage';
import { Ads, StubRewardedAdProvider } from '@/services/Ads';
import { Iap } from '@/services/Iap';
import { analytics } from '@/services/Analytics';
import { setNames } from '@/i18n';
import { AnalyticsFunnel } from '@/services/AnalyticsFunnel';
import { AnalyticsLog } from '@/services/AnalyticsLog';
import {
  CapacitorNotificationScheduler,
  NoopNotificationScheduler,
  Notifications,
} from '@/services/Notifications';
import type { OfflineReport, SaveData } from '@/core/types';

const REGISTRY_KEY = 'biskit.context';

export interface GameContextEvents {
  /** The app came back to the foreground; carries what happened while away. */
  resumed: OfflineReport;
  paused: void;
}

export interface GameContextOptions {
  store?: KeyValueStore;
  time?: Clock;
  isNative?: boolean;
}

export class GameContext {
  readonly events = new Emitter<GameContextEvents>();

  readonly clock: Clock;
  readonly state: GameState;
  readonly stats: StatSystem;
  readonly economy: Economy;
  readonly progression: Progression;
  readonly tasks: Tasks;
  readonly save: SaveManager;
  readonly ads: Ads;
  readonly iap: Iap;
  readonly notifications: Notifications;
  readonly audio: AudioBus;
  readonly music: MusicPlayer;

  private readonly store: KeyValueStore;
  readonly cloud: CloudSave;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Non-null once `boot()` has run; the settings diagnostics sheet reads them. */
  funnel: AnalyticsFunnel | null = null;
  log: AnalyticsLog | null = null;

  /** Result of the most recent catch-up, consumed once by the return card. */
  private pendingOfflineReport: OfflineReport | null = null;

  /** Whether music was running when we went to the background, so resume matches. */
  private musicWasPlaying = false;

  constructor(options: GameContextOptions = {}) {
    this.clock = options.time ?? clock;
    this.state = gameState;
    this.stats = new StatSystem(this.state, this.clock);
    this.economy = new Economy(this.state);
    this.progression = new Progression(this.state, this.economy);
    this.tasks = new Tasks(this.state, this.economy, this.progression, this.clock);
    this.audio = audio;
    this.music = music;

    // One store, shared. Diagnostics live under their own keys inside it, so
    // they can be wiped without touching the save and can never force a save
    // migration.
    this.store = options.store ?? new PreferencesStore();
    this.save = new SaveManager(this.state, {
      store: this.store,
      time: this.clock,
      onWritten: () => this.schedulePush(),
    });
    this.cloud = new CloudSave({ store: this.store });

    // The stub provider always fills; the real mediation adapter replaces it on
    // device once the native plugin is installed (see README "Ads and IAP").
    this.ads = new Ads(this.state, this.economy, this.clock, new StubRewardedAdProvider());
    this.iap = new Iap(this.state, this.economy);
    this.notifications = new Notifications(
      this.state,
      this.clock,
      options.isNative ? new CapacitorNotificationScheduler() : new NoopNotificationScheduler(),
    );
  }

  /**
   * Wire the analytics sinks.
   *
   * `analytics.register()` had never been called, so every one of the thirty-odd
   * track() calls in the codebase landed in an in-memory ring and died at
   * process exit — there was no data at all about where players stop. Awaited
   * before the save loads so the first events of a session are not dropped.
   */
  private async bindAnalytics(): Promise<void> {
    this.funnel = await AnalyticsFunnel.load(this.store, () => this.clock.now());
    this.log = new AnalyticsLog(this.store, () => this.clock.now());
    analytics.register(this.funnel);
    analytics.register(this.log);
  }

  /**
   * Take the server's copy when it is newer than ours.
   *
   * Newer means a HIGHER `rev`, never a later timestamp — see the note on that
   * field. A device that played offline holds the higher counter and keeps its
   * progress; a fresh browser holding rev 0 adopts whatever the server has,
   * which is the "I cleared my data" case working without anyone being asked to
   * do anything.
   *
   * Failure here is silent by design. The local save has already loaded, so a
   * server that is down, slow or behind a captive portal costs a sync, not a
   * session.
   */
  private async adoptNewerCloudSave(): Promise<void> {
    if (!this.cloud.enabled) return;
    try {
      const remote = await this.cloud.pull();
      if (!remote || remote.rev <= this.state.rev) return;

      // Through the same validator a save off disk goes through. The server is
      // ours, but it is still the network, and this is still untrusted input.
      const data = validate(remote.data, this.clock.now());
      data.rev = remote.rev;
      this.state.hydrate(data);
      analytics.track('sync_pulled', { rev: remote.rev });
    } catch {
      // Never fatal. Never even visible.
    }
  }

  /**
   * Queue a push. Debounced hard: the save itself is debounced at 500ms and a
   * mini-game round dirties it repeatedly, and none of that is worth a request
   * each.
   */
  schedulePush(): void {
    if (!this.cloud.enabled || this.pushTimer !== null) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.cloud.push(this.state.snapshot as SaveData);
    }, SYNC.pushDebounceMs);
  }

  /** Push now — called when the app backgrounds, which is the last chance. */
  async pushNow(): Promise<void> {
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    if (!this.cloud.enabled) return;
    await this.cloud.push(this.state.snapshot as SaveData);
  }

  /** Load the save, then apply the away period. Order matters. */
  async boot(): Promise<{ isFirstRun: boolean; offline: OfflineReport }> {
    await this.bindAnalytics();
    const loaded = await this.save.load();
    await this.adoptNewerCloudSave();
    // Before ANYTHING draws. Every label naming her is a baked texture built
    // during scene create, so a name applied later would not appear until the
    // next restart.
    setNames(this.state.playerName, this.state.petName);
    this.save.attach();
    this.audio.setMuted(this.state.muted);
    // Only the flag: playback itself waits for the first gesture, because no
    // browser will start an audio context before one.
    this.music.setMuted(this.state.musicMuted);

    const offline = this.stats.catchUp();
    this.pendingOfflineReport = offline;
    this.ads.refreshDay();
    // After catch-up, so a task that watches the stats sees the settled values
    // rather than the pre-decay ones.
    this.tasks.start();

    return { isFirstRun: !loaded, offline };
  }

  takeOfflineReport(): OfflineReport | null {
    const report = this.pendingOfflineReport;
    this.pendingOfflineReport = null;
    return report;
  }

  /** App went to background: persist now and schedule the away notifications. */
  async onPause(): Promise<void> {
    this.state.setLastSeen(this.clock.now());
    // Nothing is more irritating than a game still humming from a background tab.
    this.musicWasPlaying = this.music.isPlaying;
    this.music.stop();
    this.events.emit('paused', undefined);
    await this.save.flush();
    // Backgrounding is the last moment we are certain of getting; a phone that
    // is closed here may not run again for days.
    await this.pushNow();
    await this.notifications.scheduleForAbsence();
  }

  /** App came back: cancel pending notifications and re-apply the away period. */
  onResume(): OfflineReport {
    this.clock.reanchor();
    if (this.musicWasPlaying) {
      // The context is suspended alongside the tab; unlock before restarting.
      this.audio.unlock();
      this.music.start();
    }
    void this.notifications.cancelAll();
    const report = this.stats.catchUp();
    this.pendingOfflineReport = report;
    this.ads.refreshDay();
    // Coming back after midnight has to roll the task set over, or yesterday's
    // finished list sits there un-clearable.
    this.tasks.refreshDay();
    this.events.emit('resumed', report);
    return report;
  }

  static install(game: Phaser.Game, context: GameContext): void {
    game.registry.set(REGISTRY_KEY, context);
  }

  static from(scene: Phaser.Scene): GameContext {
    const context = scene.registry.get(REGISTRY_KEY) as GameContext | undefined;
    if (!context) throw new Error('GameContext is not installed on this game');
    return context;
  }
}

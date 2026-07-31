/**
 * The store: stats, wallet, level, inventory, timestamps.
 *
 * Plain TypeScript over a `SaveData` record, with a typed emitter on top. It
 * holds no game rules — decay lives in `StatSystem`, money in `Economy`, xp in
 * `Progression`. Everything mutating goes through a method so exactly one place
 * marks the save dirty.
 */

import { Emitter } from '@/core/EventBus';
import { CURRENCY_MUTATION_KEY, type CurrencyMutationKey } from '@/core/currencyKey';
import {
  STAT_KEYS,
  type EquippedItems,
  type PetStats,
  type RoomKey,
  type SaveData,
  type StatKey,
} from '@/core/types';
import { RELIEF, SAVE, STARTING, STAT_MAX, STAT_MIN } from '@/config/tuning';
import { clock } from '@/core/Clock';

export interface GameStateEvents {
  stats: PetStats;
  currency: { coins: number; gems: number };
  progress: { level: number; xp: number };
  sleep: { isSleeping: boolean };
  inventory: { ownedItems: readonly string[]; equipped: EquippedItems };
  ads: { adWatchesToday: number; adDayKey: string };
  muted: { muted: boolean; musicMuted: boolean };
  tasks: { counts: Readonly<Record<string, number>>; claimed: readonly string[] };
  relief: { relief: number };
  mess: { room: RoomKey | null };
  /** Something persisted changed; SaveManager debounces on this. */
  dirty: void;
}

export function clampStat(value: number): number {
  if (Number.isNaN(value)) return STAT_MIN;
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value));
}

export function createDefaultSave(nowMs: number = clock.now()): SaveData {
  return {
    version: SAVE.version,
    stats: { ...STARTING.stats },
    coins: STARTING.coins,
    gems: STARTING.gems,
    level: STARTING.level,
    xp: STARTING.xp,
    ownedItems: [],
    equipped: { hat: null, outfit: null },
    isSleeping: false,
    lastSeenUtc: nowMs,
    sleepStartedUtc: null,
    adWatchesToday: 0,
    adDayKey: clock.localDayKey(nowMs),
    totalPlaySeconds: 0,
    dailyLoginDayKey: '',
    dailyLoginStreak: 0,
    notificationsSentToday: 0,
    notificationDayKey: clock.localDayKey(nowMs),
    // Not today's key: a new player has not shared, and seeding it with today
    // would withhold the first bonus until tomorrow.
    photoDayKey: '',
    muted: false,
    musicMuted: false,
    playerName: '',
    petName: '',
    rev: 0,
    taskDayKey: '',
    taskIds: [],
    taskCounts: {},
    taskClaimed: [],
    tutorialStep: 0,
    relief: STARTING.relief,
    messRoom: null,
  };
}

/**
 * Relief's own clamp.
 *
 * NOT `clampStat`, which floors at `STAT_MIN` (5) because a meter reading
 * empty looks like a dead pet. This has no meter, and 0 here has a precise
 * meaning: the moment the grace countdown starts.
 */
export function clampRelief(value: number): number {
  if (Number.isNaN(value)) return RELIEF.max;
  return Math.min(RELIEF.max, Math.max(RELIEF.min, value));
}

export class GameState {
  readonly events = new Emitter<GameStateEvents>();

  private data: SaveData;

  constructor(initial: SaveData = createDefaultSave()) {
    this.data = initial;
  }

  /* ----------------------------- reads ----------------------------- */

  /** Read-only view. Never mutate the result — mutate through the methods. */
  get snapshot(): Readonly<SaveData> {
    return this.data;
  }

  get stats(): Readonly<PetStats> {
    return this.data.stats;
  }

  stat(key: StatKey): number {
    return this.data.stats[key];
  }

  get coins(): number {
    return this.data.coins;
  }

  get gems(): number {
    return this.data.gems;
  }

  get level(): number {
    return this.data.level;
  }

  get xp(): number {
    return this.data.xp;
  }

  get isSleeping(): boolean {
    return this.data.isSleeping;
  }

  get sleepStartedUtc(): number | null {
    return this.data.sleepStartedUtc;
  }

  get lastSeenUtc(): number {
    return this.data.lastSeenUtc;
  }

  get relief(): number {
    return this.data.relief;
  }

  get messRoom(): RoomKey | null {
    return this.data.messRoom;
  }

  get ownedItems(): readonly string[] {
    return this.data.ownedItems;
  }

  get equipped(): Readonly<EquippedItems> {
    return this.data.equipped;
  }

  get adWatchesToday(): number {
    return this.data.adWatchesToday;
  }

  get adDayKey(): string {
    return this.data.adDayKey;
  }

  get muted(): boolean {
    return this.data.muted;
  }

  get musicMuted(): boolean {
    return this.data.musicMuted;
  }

  get taskDayKey(): string {
    return this.data.taskDayKey;
  }

  get rev(): number {
    return this.data.rev;
  }

  /** Called by SaveManager on every write, so it counts writes, not mutations. */
  bumpRev(): number {
    this.data.rev += 1;
    return this.data.rev;
  }

  get playerName(): string {
    return this.data.playerName;
  }

  get petName(): string {
    return this.data.petName;
  }

  /** Both at once: they are asked for together and there is no half-named save. */
  setNames(playerName: string, petName: string): void {
    this.data.playerName = playerName;
    this.data.petName = petName;
    this.markDirty();
  }

  get taskIds(): readonly string[] {
    return this.data.taskIds;
  }

  get taskCounts(): Readonly<Record<string, number>> {
    return this.data.taskCounts;
  }

  get taskClaimed(): readonly string[] {
    return this.data.taskClaimed;
  }

  get tutorialStep(): number {
    return this.data.tutorialStep;
  }

  get totalPlaySeconds(): number {
    return this.data.totalPlaySeconds;
  }

  /** The lowest of the four stats — drives mood and the "needs you" dot. */
  lowestStat(): { key: StatKey; value: number } {
    let key: StatKey = 'hunger';
    let value = Number.POSITIVE_INFINITY;
    for (const k of STAT_KEYS) {
      const v = this.data.stats[k];
      if (v < value) {
        value = v;
        key = k;
      }
    }
    return { key, value };
  }

  owns(itemId: string): boolean {
    return this.data.ownedItems.includes(itemId);
  }

  /* ----------------------------- writes ---------------------------- */

  /** Replace the whole record — used by SaveManager on load. */
  hydrate(data: SaveData): void {
    this.data = data;
    this.events.emit('stats', { ...this.data.stats });
    this.events.emit('currency', { coins: this.data.coins, gems: this.data.gems });
    this.events.emit('progress', { level: this.data.level, xp: this.data.xp });
    this.events.emit('sleep', { isSleeping: this.data.isSleeping });
    this.events.emit('inventory', {
      ownedItems: this.data.ownedItems,
      equipped: { ...this.data.equipped },
    });
    this.events.emit('ads', {
      adWatchesToday: this.data.adWatchesToday,
      adDayKey: this.data.adDayKey,
    });
    this.events.emit('muted', { muted: this.data.muted, musicMuted: this.data.musicMuted });
    // Both of these drive things drawn in the room. A save loaded mid-session
    // without them leaves the bubble up and the puddle on the floor.
    this.events.emit('relief', { relief: this.data.relief });
    this.events.emit('mess', { room: this.data.messRoom });
  }

  setStat(key: StatKey, value: number): void {
    const next = clampStat(value);
    if (next === this.data.stats[key]) return;
    this.data.stats[key] = next;
    this.emitStats();
  }

  addStat(key: StatKey, delta: number): void {
    this.setStat(key, this.data.stats[key] + delta);
  }

  setStats(stats: PetStats): void {
    for (const k of STAT_KEYS) {
      this.data.stats[k] = clampStat(stats[k]);
    }
    this.emitStats();
  }

  /**
   * Currency mutation. Guarded by a capability token so no scene, UI element
   * or service can move money without going through `Economy`. Spec §7.
   */
  applyCurrency(
    key: CurrencyMutationKey,
    delta: { coins?: number; gems?: number },
  ): void {
    if (key !== CURRENCY_MUTATION_KEY) {
      throw new Error('GameState.applyCurrency: currency may only be mutated by Economy');
    }
    const coins = Math.max(0, this.data.coins + (delta.coins ?? 0));
    const gems = Math.max(0, this.data.gems + (delta.gems ?? 0));
    if (coins === this.data.coins && gems === this.data.gems) return;
    this.data.coins = coins;
    this.data.gems = gems;
    this.events.emit('currency', { coins, gems });
    this.markDirty();
  }

  setProgress(level: number, xp: number): void {
    this.data.level = level;
    this.data.xp = xp;
    this.events.emit('progress', { level, xp });
    this.markDirty();
  }

  setSleeping(isSleeping: boolean, atMs: number = clock.now()): void {
    if (this.data.isSleeping === isSleeping) return;
    this.data.isSleeping = isSleeping;
    this.data.sleepStartedUtc = isSleeping ? atMs : null;
    this.events.emit('sleep', { isSleeping });
    this.markDirty();
  }

  addItem(itemId: string): void {
    if (this.data.ownedItems.includes(itemId)) return;
    this.data.ownedItems.push(itemId);
    this.emitInventory();
  }

  equip(slot: keyof EquippedItems, itemId: string | null): void {
    if (this.data.equipped[slot] === itemId) return;
    this.data.equipped[slot] = itemId;
    this.emitInventory();
  }

  setRelief(value: number): void {
    const next = clampRelief(value);
    if (next === this.data.relief) return;
    this.data.relief = next;
    this.events.emit('relief', { relief: next });
    this.markDirty();
  }

  addRelief(delta: number): void {
    this.setRelief(this.data.relief + delta);
  }

  /** Where the accident happened, or null once it has been cleared up. */
  setMess(room: RoomKey | null): void {
    if (this.data.messRoom === room) return;
    this.data.messRoom = room;
    this.events.emit('mess', { room });
    this.markDirty();
  }

  setLastSeen(atMs: number): void {
    this.data.lastSeenUtc = atMs;
    this.markDirty();
  }

  /** Ad counter, with the device-local day rollover baked in. */
  recordAdWatch(dayKey: string): void {
    if (this.data.adDayKey !== dayKey) {
      this.data.adDayKey = dayKey;
      this.data.adWatchesToday = 0;
    }
    this.data.adWatchesToday += 1;
    this.events.emit('ads', {
      adWatchesToday: this.data.adWatchesToday,
      adDayKey: this.data.adDayKey,
    });
    this.markDirty();
  }

  /** Roll the ad day forward without consuming a watch. */
  rollAdDay(dayKey: string): void {
    if (this.data.adDayKey === dayKey) return;
    this.data.adDayKey = dayKey;
    this.data.adWatchesToday = 0;
    this.events.emit('ads', { adWatchesToday: 0, adDayKey: dayKey });
    this.markDirty();
  }

  /**
   * Claim today's share bonus, or find it already claimed.
   *
   * Returns whether this call is the one that got it, so the caller cannot
   * pay out twice by reading and writing in two steps — the check and the
   * write are the same operation.
   */
  claimPhotoBonus(dayKey: string): boolean {
    if (this.data.photoDayKey === dayKey) return false;
    this.data.photoDayKey = dayKey;
    this.markDirty();
    return true;
  }

  get photoDayKey(): string {
    return this.data.photoDayKey;
  }

  setDailyLogin(dayKey: string, streak: number): void {
    this.data.dailyLoginDayKey = dayKey;
    this.data.dailyLoginStreak = streak;
    this.markDirty();
  }

  get dailyLoginDayKey(): string {
    return this.data.dailyLoginDayKey;
  }

  get dailyLoginStreak(): number {
    return this.data.dailyLoginStreak;
  }

  get notificationsSentToday(): number {
    return this.data.notificationsSentToday;
  }

  get notificationDayKey(): string {
    return this.data.notificationDayKey;
  }

  recordNotificationsScheduled(dayKey: string, count: number): void {
    if (this.data.notificationDayKey !== dayKey) {
      this.data.notificationDayKey = dayKey;
      this.data.notificationsSentToday = 0;
    }
    this.data.notificationsSentToday += count;
    this.markDirty();
  }

  setMuted(muted: boolean): void {
    if (this.data.muted === muted) return;
    this.data.muted = muted;
    this.events.emit('muted', { muted, musicMuted: this.data.musicMuted });
    this.markDirty();
  }

  /** New day: fresh task set, so yesterday's progress cannot leak into it. */
  resetTasksForDay(dayKey: string, ids: readonly string[]): void {
    this.data.taskDayKey = dayKey;
    this.data.taskIds = [...ids];
    this.data.taskCounts = {};
    this.data.taskClaimed = [];
    this.emitTasks();
  }

  advanceTask(id: string, by = 1): void {
    this.data.taskCounts[id] = (this.data.taskCounts[id] ?? 0) + by;
    this.emitTasks();
  }

  markTaskClaimed(id: string): void {
    if (this.data.taskClaimed.includes(id)) return;
    this.data.taskClaimed = [...this.data.taskClaimed, id];
    this.emitTasks();
  }

  setTutorialStep(step: number): void {
    if (this.data.tutorialStep === step) return;
    this.data.tutorialStep = step;
    this.markDirty();
  }

  private emitTasks(): void {
    this.events.emit('tasks', {
      counts: this.data.taskCounts,
      claimed: this.data.taskClaimed,
    });
    this.markDirty();
  }

  setMusicMuted(musicMuted: boolean): void {
    if (this.data.musicMuted === musicMuted) return;
    this.data.musicMuted = musicMuted;
    this.events.emit('muted', { muted: this.data.muted, musicMuted });
    this.markDirty();
  }

  addPlaySeconds(seconds: number): void {
    this.data.totalPlaySeconds += seconds;
    // Deliberately not dirty-marking: the debounced save picks it up with the
    // next real mutation, and on `pause` SaveManager forces a write anyway.
  }

  markDirty(): void {
    this.events.emit('dirty', undefined);
  }

  private emitStats(): void {
    this.events.emit('stats', { ...this.data.stats });
    this.markDirty();
  }

  private emitInventory(): void {
    this.events.emit('inventory', {
      ownedItems: this.data.ownedItems,
      equipped: { ...this.data.equipped },
    });
    this.markDirty();
  }
}

/** The app-wide store. Tests construct their own. */
export const gameState = new GameState();

/**
 * Local notifications. Spec §14 — the retention engine, more than any gameplay
 * feature, which is exactly why it is the easiest thing to ruin.
 *
 * Rules:
 *  - schedule at the moment a stat is predicted to cross its threshold;
 *  - never between 22:00 and 08:00 device-local;
 *  - max 2 per day — more trains people to disable them, unrecoverably;
 *  - copy is the pet speaking, short and specific;
 *  - cancel everything pending on app open.
 *
 * The scheduling maths is pure and exported, so the quiet-window and cap rules
 * are testable without a device.
 */

import { MS_PER_HOUR, NOTIFICATIONS, SLEEP, STAT_DECAY_PER_HOUR, STAT_NOTIFY_BELOW } from '@/config/tuning';
import type { Clock } from '@/core/Clock';
import type { GameState } from '@/core/GameState';
import { STAT_KEYS, type PetStats, type StatKey } from '@/core/types';
import { analytics } from '@/services/Analytics';
import { t, type MessageKey } from '@/i18n';

export interface PlannedNotification {
  id: number;
  stat: StatKey;
  title: string;
  body: string;
  /** ms epoch. */
  at: number;
}

/** The pet speaking. Short, specific, never "Come back!". */
/** Catalogue KEYS, resolved when the notification is scheduled. */
const COPY: Readonly<Record<StatKey, { title: MessageKey; body: MessageKey }>> = {
  hunger: { title: 'notify.hunger.title', body: 'notify.hunger.body' },
  energy: { title: 'notify.energy.title', body: 'notify.energy.body' },
  fun: { title: 'notify.fun.title', body: 'notify.fun.body' },
  clean: { title: 'notify.clean.title', body: 'notify.clean.body' },
};

/** Stable ids so a reschedule replaces rather than duplicates. */
const NOTIFICATION_ID: Readonly<Record<StatKey, number>> = {
  hunger: 101,
  energy: 102,
  fun: 103,
  clean: 104,
};

/**
 * When will `stat` fall below its notification threshold, in ms from now?
 * `null` when it is already below (no point announcing the past) or when it
 * will not fall at all (asleep, or a stat that does not decay in this state).
 */
export function msUntilThreshold(
  stat: StatKey,
  stats: Readonly<PetStats>,
  isSleeping: boolean,
): number | null {
  const value = stats[stat];
  const threshold = STAT_NOTIFY_BELOW[stat];
  if (value <= threshold) return null;

  let ratePerHour = STAT_DECAY_PER_HOUR[stat];
  if (isSleeping) {
    if (stat === 'energy') return null; // climbing, not falling
    if (stat === 'hunger') ratePerHour *= SLEEP.hungerDecayMultiplier;
    if (stat === 'fun') ratePerHour *= SLEEP.funDecayMultiplier;
    if (stat === 'clean') ratePerHour *= SLEEP.cleanDecayMultiplier;
  }
  if (ratePerHour <= 0) return null;

  return ((value - threshold) / ratePerHour) * MS_PER_HOUR;
}

/** True when `atMs` falls inside the device-local quiet window. */
export function isQuietHour(atMs: number, hourOf: (ms: number) => number): boolean {
  const hour = hourOf(atMs);
  // The window wraps midnight: 22:00-23:59 and 00:00-07:59.
  return hour >= NOTIFICATIONS.quietStartHour || hour < NOTIFICATIONS.quietEndHour;
}

/**
 * Push `atMs` forward to the end of the quiet window if it lands inside it.
 * A pet that got hungry at 03:00 says so at 08:00, not at 03:00.
 */
export function shiftOutOfQuietHours(
  atMs: number,
  hourOf: (ms: number) => number,
  startOfHour: (ms: number, hour: number) => number,
): number {
  if (!isQuietHour(atMs, hourOf)) return atMs;

  const hour = hourOf(atMs);
  // Before 08:00 -> this morning. At/after 22:00 -> tomorrow morning.
  const dayOffset = hour >= NOTIFICATIONS.quietStartHour ? MS_PER_HOUR * 24 : 0;
  return startOfHour(atMs + dayOffset, NOTIFICATIONS.quietEndHour);
}

export interface PlanOptions {
  stats: Readonly<PetStats>;
  isSleeping: boolean;
  nowMs: number;
  hourOf: (ms: number) => number;
  startOfHour: (ms: number, hour: number) => number;
  /** How many have already been scheduled for today. */
  alreadyToday: number;
}

/**
 * Choose what to schedule. Soonest-first, quiet hours respected, capped at
 * two per day.
 */
export function planNotifications(options: PlanOptions): PlannedNotification[] {
  const budget = Math.max(0, NOTIFICATIONS.maxPerDay - options.alreadyToday);
  if (budget === 0) return [];

  const candidates: PlannedNotification[] = [];
  for (const stat of STAT_KEYS) {
    const delta = msUntilThreshold(stat, options.stats, options.isSleeping);
    if (delta === null) continue;

    const at = shiftOutOfQuietHours(
      options.nowMs + delta,
      options.hourOf,
      options.startOfHour,
    );
    candidates.push({
      id: NOTIFICATION_ID[stat],
      stat,
      title: t(COPY[stat].title),
      body: t(COPY[stat].body),
      at,
    });
  }

  candidates.sort((a, b) => a.at - b.at);
  return candidates.slice(0, budget);
}

/* ------------------------------------------------------------------ *
 * Runtime wiring
 * ------------------------------------------------------------------ */

export interface NotificationScheduler {
  requestPermission(): Promise<boolean>;
  cancelAll(): Promise<void>;
  schedule(items: readonly PlannedNotification[]): Promise<void>;
}

/** Capacitor Local Notifications adapter, imported lazily. */
export class CapacitorNotificationScheduler implements NotificationScheduler {
  async requestPermission(): Promise<boolean> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch {
      return false;
    }
  }

  async cancelAll(): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }
    } catch (err) {
      console.warn('[Notifications] cancelAll failed', err);
    }
  }

  async schedule(items: readonly PlannedNotification[]): Promise<void> {
    if (items.length === 0) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          schedule: { at: new Date(item.at), allowWhileIdle: false },
        })),
      });
    } catch (err) {
      console.warn('[Notifications] schedule failed', err);
    }
  }
}

/** No-op scheduler for web and tests. */
export class NoopNotificationScheduler implements NotificationScheduler {
  requestPermission(): Promise<boolean> {
    return Promise.resolve(false);
  }
  cancelAll(): Promise<void> {
    return Promise.resolve();
  }
  schedule(): Promise<void> {
    return Promise.resolve();
  }
}

export class Notifications {
  private readonly state: GameState;
  private readonly time: Clock;
  private readonly scheduler: NotificationScheduler;
  private permitted = false;

  constructor(state: GameState, time: Clock, scheduler: NotificationScheduler) {
    this.state = state;
    this.time = time;
    this.scheduler = scheduler;
  }

  async requestPermission(): Promise<boolean> {
    this.permitted = await this.scheduler.requestPermission();
    analytics.track('notification_permission', { granted: this.permitted });
    return this.permitted;
  }

  /** Cancel everything pending — call on app open (§14). */
  async cancelAll(): Promise<void> {
    await this.scheduler.cancelAll();
  }

  /** Called on `pause`: this is the only moment we know the player is leaving. */
  async scheduleForAbsence(): Promise<PlannedNotification[]> {
    if (!this.permitted) return [];

    const nowMs = this.time.now();
    const dayKey = this.time.localDayKey(nowMs);
    const alreadyToday = this.state.notificationDayKey === dayKey ? this.state.notificationsSentToday : 0;

    const planned = planNotifications({
      stats: this.state.stats,
      isSleeping: this.state.isSleeping,
      nowMs,
      hourOf: (ms) => this.time.localHour(ms),
      startOfHour: (ms, hour) => {
        const d = new Date(ms);
        d.setHours(hour, 0, 0, 0);
        return d.getTime();
      },
      alreadyToday,
    });

    await this.scheduler.cancelAll();
    await this.scheduler.schedule(planned);

    if (planned.length > 0) {
      this.state.recordNotificationsScheduled(dayKey, planned.length);
      analytics.track('notifications_scheduled', {
        count: planned.length,
        first: planned[0]?.stat ?? '',
      });
    }
    return planned;
  }

  get hasPermission(): boolean {
    return this.permitted;
  }
}

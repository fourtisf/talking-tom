/**
 * Daily tasks — the game's answer to "what am I supposed to do?"
 *
 * A pet game with no stated goal reads as a toy. These are the asks: three a
 * day, each naming one concrete action and paying coins and XP for it, so
 * levelling has a visible path instead of being a side effect of poking around.
 *
 * Progress is counted off `Progression`'s existing `xpGained` event rather than
 * from each action handler, so adding a task never means editing HomeScene.
 * Two triggers have no XP reason behind them and are reported explicitly:
 * `sleep`, and `allStatsHigh` which is derived from the stats themselves.
 */

import { TASKS, type TaskDef, type TaskTrigger } from '@/config/tuning';
import type { Clock } from '@/core/Clock';
import type { Economy } from '@/core/Economy';
import { Emitter } from '@/core/EventBus';
import type { GameState } from '@/core/GameState';
import type { Progression } from '@/core/Progression';
import { STAT_KEYS } from '@/core/types';
import { analytics } from '@/services/Analytics';

export interface TaskView {
  readonly def: TaskDef;
  readonly count: number;
  readonly done: boolean;
  readonly claimed: boolean;
}

export interface TasksEvents {
  /** Any progress change — the badge and the sheet both redraw on this. */
  changed: void;
  /** A task just hit its target and is waiting to be claimed. */
  completed: { def: TaskDef };
  claimed: { def: TaskDef; coins: number; xp: number };
}

/**
 * Deterministic day -> task selection.
 *
 * Same day gives the same three tasks however many times the app is reopened,
 * and no two of them are the same task. A random draw stored in the save would
 * do as well, but this cannot desync from the day key it is keyed on.
 */
export function tasksForDay(dayKey: string, pool: readonly TaskDef[] = TASKS.pool): TaskDef[] {
  const count = Math.min(TASKS.perDay, pool.length);
  if (count <= 0) return [];

  // A small string hash, so the seed differs a lot between adjacent days.
  let seed = 0;
  for (let i = 0; i < dayKey.length; i++) {
    seed = (seed * 31 + dayKey.charCodeAt(i)) >>> 0;
  }

  const remaining = [...pool];
  const picked: TaskDef[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const index = seed % remaining.length;
    const [task] = remaining.splice(index, 1);
    if (task) picked.push(task);
  }
  return picked;
}

export class Tasks {
  readonly events = new Emitter<TasksEvents>();

  private readonly state: GameState;
  private readonly economy: Economy;
  private readonly progression: Progression;
  private readonly time: Clock;
  private readonly unsubscribers: (() => void)[] = [];

  private today: TaskDef[] = [];

  constructor(state: GameState, economy: Economy, progression: Progression, time: Clock) {
    this.state = state;
    this.economy = economy;
    this.progression = progression;
    this.time = time;
  }

  /** Draw today's set and start listening. Call once, after the save loads. */
  start(): void {
    this.refreshDay();

    this.unsubscribers.push(
      // A task's own XP payout must not count as progress toward a task.
      this.progression.events.on('xpGained', ({ reason, count }) => {
        if (reason !== 'task') this.report(reason, count);
      }),
      // Cheap: `allStatsHigh` is the only stat-derived task and it is a
      // four-number check, so re-testing it on every stat change costs nothing.
      this.state.events.on('stats', () => this.checkStats()),
    );
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
  }

  /** Roll over to a new day if one has passed. Safe to call on every resume. */
  refreshDay(): void {
    const todayKey = this.time.localDayKey();
    if (this.state.taskDayKey !== todayKey) {
      this.state.resetTasksForDay(todayKey);
    }
    this.today = tasksForDay(todayKey);
    this.events.emit('changed', undefined);
  }

  get list(): TaskView[] {
    const counts = this.state.taskCounts;
    const claimed = this.state.taskClaimed;
    return this.today.map((def) => {
      const count = Math.min(def.target, counts[def.id] ?? 0);
      return { def, count, done: count >= def.target, claimed: claimed.includes(def.id) };
    });
  }

  /** Finished but not yet collected — what the badge on the button counts. */
  get claimableCount(): number {
    return this.list.filter((t) => t.done && !t.claimed).length;
  }

  get allDone(): boolean {
    const list = this.list;
    return list.length > 0 && list.every((t) => t.claimed);
  }

  /** Record one occurrence of `trigger` against every task waiting on it. */
  report(trigger: TaskTrigger, by = 1): void {
    let changed = false;
    for (const view of this.list) {
      if (view.def.trigger !== trigger || view.done) continue;
      this.state.advanceTask(view.def.id, by);
      changed = true;

      const after = Math.min(view.def.target, (this.state.taskCounts[view.def.id] ?? 0));
      if (after >= view.def.target) {
        analytics.track('task_completed', { task: view.def.id });
        this.events.emit('completed', { def: view.def });
      }
    }
    if (changed) this.events.emit('changed', undefined);
  }

  /**
   * Pay out a finished task. Returns false when there is nothing to pay, which
   * is the same answer for "not finished" and "already taken" — the caller only
   * needs to know whether to play the sound.
   */
  claim(id: string): boolean {
    const view = this.list.find((t) => t.def.id === id);
    if (!view || !view.done || view.claimed) return false;

    this.state.markTaskClaimed(id);
    this.economy.earn(view.def.coins, 'task');
    this.progression.awardFlat(view.def.xp, 'task');
    analytics.track('task_claimed', { task: id, coins: view.def.coins, xp: view.def.xp });
    this.events.emit('claimed', { def: view.def, coins: view.def.coins, xp: view.def.xp });
    this.events.emit('changed', undefined);
    return true;
  }

  /** `allStatsHigh` is a state of the pet, not an action, so it is polled. */
  private checkStats(): void {
    const wants = this.list.some((t) => t.def.trigger === 'allStatsHigh' && !t.done);
    if (!wants) return;
    const allHigh = STAT_KEYS.every((key) => this.state.stat(key) >= TASKS.allStatsTarget);
    if (allHigh) this.report('allStatsHigh');
  }
}

import { beforeEach, describe, expect, it } from 'vitest';

import { TASKS, type TaskDef } from '@/config/tuning';
import { Clock, clock } from '@/core/Clock';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import { Progression } from '@/core/Progression';
import { Tasks, eligiblePool, tasksForDay } from '@/core/Tasks';

/**
 * Day fixtures are SEARCHED FOR, not pinned.
 *
 * The draw is deterministic per day, so a test asserting on a particular task
 * has to run on a day that draws it — otherwise it silently skips itself and
 * proves nothing. Four hand-derived constants used to sit here, and they broke
 * twice in two days: the draw hashes the day key over the ELIGIBLE pool, so
 * adding one task reshuffles the whole calendar, and so does removing a
 * `minLevel`. Both times the failure looked like a bug in `Tasks`.
 *
 * `eligiblePool` is the same function `Tasks.refreshDay` calls, at the level a
 * fresh save starts on, so this cannot drift from what the game actually
 * draws — which is the entire problem the constants had.
 */
function dayDrawing(id: string): number {
  const pool = eligiblePool(createDefaultSave(0).level);
  for (let day = 1; day <= 90; day++) {
    const ms = Date.UTC(2026, 0, day, 9, 0, 0);
    if (tasksForDay(clock.localDayKey(ms), pool).some((t) => t.id === id)) return ms;
  }
  throw new Error(`no day in the search window draws "${id}" — is it still in the pool?`);
}

/** pet10 has target 10; catch8 has target 8; happy is allStatsHigh. */
const DAY_MULTI = dayDrawing('pet10');
const DAY_HAPPY = dayDrawing('happy');
const DAY_CATCH = dayDrawing('catch8');
const T0 = dayDrawing('feed3');

function build(nowMs = T0) {
  let wall = nowMs;
  const clock = new Clock({ wallNow: () => wall, monotonicNow: () => 0 });
  const state = new GameState(createDefaultSave(wall));
  const economy = new Economy(state);
  const progression = new Progression(state, economy);
  const tasks = new Tasks(state, economy, progression, clock);
  tasks.start();
  return {
    state,
    economy,
    progression,
    tasks,
    setNow: (ms: number) => {
      wall = ms;
    },
  };
}

describe('tasksForDay', () => {
  it('is stable for a given day', () => {
    const a = tasksForDay('2026-06-12').map((t) => t.id);
    const b = tasksForDay('2026-06-12').map((t) => t.id);
    expect(a).toEqual(b);
  });

  it('never repeats a task within a day', () => {
    for (const day of ['2026-01-01', '2026-06-12', '2026-12-31', '2027-02-28']) {
      const ids = tasksForDay(day).map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('gives a different set on most days', () => {
    // Not every adjacent pair need differ, but a hash that collapses would show
    // up as one repeated set across a month.
    const sets = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const key = `2026-06-${String(d).padStart(2, '0')}`;
      sets.add(tasksForDay(key).map((t) => t.id).sort().join(','));
    }
    expect(sets.size).toBeGreaterThan(3);
  });

  it('draws exactly the configured count', () => {
    expect(tasksForDay('2026-06-12')).toHaveLength(TASKS.perDay);
  });

  it('cannot ask for more tasks than the pool holds', () => {
    const tiny: TaskDef[] = [TASKS.pool[0] as TaskDef];
    expect(tasksForDay('2026-06-12', tiny)).toHaveLength(1);
  });
});

describe('Tasks progress', () => {
  let env: ReturnType<typeof build>;

  beforeEach(() => {
    env = build();
  });

  it('counts an action against a task waiting on it', () => {
    const feed = env.tasks.list.find((t) => t.def.id === 'feed3');
    expect(feed).toBeDefined();
    env.progression.award('feed');
    expect(env.tasks.list.find((t) => t.def.id === 'feed3')?.count).toBe(1);
  });

  it('counts a whole mini-game round by catches, not as one event', () => {
    // The mini-game awards ONCE for the round with the catch count as the
    // multiplier. Counting the event instead of its `count` scores 1, not 8,
    // and "Catch 8 treats" becomes impossible.
    const catchEnv = build(DAY_CATCH);
    const before = catchEnv.tasks.list.find((t) => t.def.id === 'catch8');
    expect(before?.count).toBe(0);

    catchEnv.progression.award('miniGameCatch', 8);

    const after = catchEnv.tasks.list.find((t) => t.def.id === 'catch8');
    expect(after?.count).toBe(8);
    expect(after?.done).toBe(true);
  });

  it('clamps a count at the target rather than overshooting', () => {
    const view = env.tasks.list[0];
    expect(view).toBeDefined();
    if (!view) return;
    env.tasks.report(view.def.trigger, view.def.target + 50);
    const after = env.tasks.list.find((t) => t.def.id === view.def.id);
    expect(after?.count).toBe(view.def.target);
    expect(after?.done).toBe(true);
  });

  it('pays coins and XP once, and refuses a second claim', () => {
    const view = env.tasks.list[0];
    expect(view).toBeDefined();
    if (!view) return;

    env.tasks.report(view.def.trigger, view.def.target);
    const coinsBefore = env.state.coins;
    const xpBefore = env.state.xp;

    expect(env.tasks.claim(view.def.id)).toBe(true);
    expect(env.state.coins).toBe(coinsBefore + view.def.coins);
    expect(env.state.xp).toBeGreaterThan(xpBefore);

    const coinsAfter = env.state.coins;
    expect(env.tasks.claim(view.def.id)).toBe(false);
    expect(env.state.coins).toBe(coinsAfter);
  });

  it('refuses to pay an unfinished task', () => {
    const multi = build(DAY_MULTI);
    const view = multi.tasks.list.find((t) => t.def.id === 'pet10');
    expect(view).toBeDefined();
    if (!view) return;
    multi.tasks.report(view.def.trigger, view.def.target - 1);
    expect(multi.tasks.claim(view.def.id)).toBe(false);
  });

  it("does not count a task's own XP payout as progress", () => {
    // The reward is awarded through Progression, which Tasks listens to. Without
    // the 'task' guard a claim would advance every other task on the list.
    const view = env.tasks.list[0];
    if (!view) return;
    env.tasks.report(view.def.trigger, view.def.target);

    const others = env.tasks.list.filter((t) => t.def.id !== view.def.id);
    const before = others.map((t) => t.count);
    env.tasks.claim(view.def.id);
    const after = env.tasks.list
      .filter((t) => t.def.id !== view.def.id)
      .map((t) => t.count);
    expect(after).toEqual(before);
  });

  it('counts claimable, and stops counting once collected', () => {
    const view = env.tasks.list[0];
    if (!view) return;
    expect(env.tasks.claimableCount).toBe(0);
    env.tasks.report(view.def.trigger, view.def.target);
    expect(env.tasks.claimableCount).toBe(1);
    env.tasks.claim(view.def.id);
    expect(env.tasks.claimableCount).toBe(0);
  });

  it('emits `completed` exactly once, on the crossing', () => {
    const multi = build(DAY_MULTI);
    const view = multi.tasks.list.find((t) => t.def.id === 'pet10');
    expect(view).toBeDefined();
    if (!view) return;
    let fired = 0;
    const env = multi;
    env.tasks.events.on('completed', () => {
      fired += 1;
    });
    for (let i = 0; i < view.def.target + 3; i++) env.tasks.report(view.def.trigger);
    expect(fired).toBe(1);
  });
});

describe('Tasks day rollover', () => {
  it('clears progress and redraws when the day changes', () => {
    const env = build();
    const view = env.tasks.list[0];
    expect(view).toBeDefined();
    if (!view) return;
    env.tasks.report(view.def.trigger, view.def.target);
    env.tasks.claim(view.def.id);
    expect(env.state.taskClaimed).toHaveLength(1);

    env.setNow(T0 + 26 * 60 * 60 * 1000);
    env.tasks.refreshDay();

    expect(env.state.taskClaimed).toHaveLength(0);
    expect(env.tasks.claimableCount).toBe(0);
    expect(env.tasks.list.every((t) => t.count === 0)).toBe(true);
  });

  it('keeps progress across a reopen on the same day', () => {
    const env = build();
    const view = env.tasks.list[0];
    if (!view) return;
    env.tasks.report(view.def.trigger, 1);
    const before = env.tasks.list.find((t) => t.def.id === view.def.id)?.count;

    env.tasks.refreshDay();
    expect(env.tasks.list.find((t) => t.def.id === view.def.id)?.count).toBe(before);
  });
});

describe('allStatsHigh', () => {
  it('completes when every meter clears the bar, and not before', () => {
    const env = build(DAY_HAPPY);
    expect(env.tasks.list.some((t) => t.def.id === 'happy')).toBe(true);

    env.state.setStat('hunger', TASKS.allStatsTarget + 5);
    env.state.setStat('energy', TASKS.allStatsTarget + 5);
    env.state.setStat('fun', TASKS.allStatsTarget + 5);
    // One still below: must not complete.
    env.state.setStat('clean', TASKS.allStatsTarget - 1);
    expect(env.tasks.list.find((t) => t.def.id === 'happy')?.done).toBe(false);

    env.state.setStat('clean', TASKS.allStatsTarget);
    expect(env.tasks.list.find((t) => t.def.id === 'happy')?.done).toBe(true);
  });

  it('stays done after a meter falls back below the bar', () => {
    // It is an achievement, not a live condition. Un-completing it would take a
    // finished task off the list while the player was looking at it.
    const env = build(DAY_HAPPY);
    for (const key of ['hunger', 'energy', 'fun', 'clean'] as const) {
      env.state.setStat(key, TASKS.allStatsTarget + 5);
    }
    expect(env.tasks.list.find((t) => t.def.id === 'happy')?.done).toBe(true);
    env.state.setStat('clean', 10);
    expect(env.tasks.list.find((t) => t.def.id === 'happy')?.done).toBe(true);
  });
});

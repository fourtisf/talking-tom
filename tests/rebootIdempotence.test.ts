/**
 * Booting twice in one session must change nothing the second time.
 *
 * This is not hypothetical. Changing the language reboots the scene stack —
 * Phaser bakes a Text into a canvas texture at creation, so there is no way to
 * re-translate a running screen — and that reboot re-runs the whole start-up
 * path: the save loads again, the away period is applied again, the daily set
 * is resolved again, and the daily-login card is offered again.
 *
 * Every one of those is supposed to be keyed on something that makes a second
 * pass a no-op. If any of them is not, switching language is a button that
 * prints money, and the player who finds it will not report it.
 */

import { describe, expect, it } from 'vitest';

import { Clock } from '@/core/Clock';
import { DailyLogin } from '@/core/DailyLogin';
import { Economy } from '@/core/Economy';
import { GameState, createDefaultSave } from '@/core/GameState';
import { Progression } from '@/core/Progression';
import { StatSystem } from '@/core/StatSystem';
import { Tasks } from '@/core/Tasks';
import { MS_PER_HOUR } from '@/config/tuning';

const START = new Date(2026, 6, 29, 9, 0).getTime();

function setup(awayHours = 0) {
  // Fixed clock: every test here is about a SECOND pass with no time between,
  // which is exactly what a reboot is.
  const wall = START;
  const mono = 0;
  const time = new Clock({ wallNow: () => wall, monotonicNow: () => mono });

  const save = createDefaultSave(START - awayHours * MS_PER_HOUR);
  save.coins = 0;
  save.lastSeenUtc = START - awayHours * MS_PER_HOUR;
  const state = new GameState(save);
  const economy = new Economy(state);
  const progression = new Progression(state, economy);

  return {
    state,
    stats: new StatSystem(state, time),
    login: new DailyLogin(state, economy, time),
    tasks: new Tasks(state, economy, progression, time),
  };
}

describe('booting a second time in the same session', () => {
  it('does not pay the daily login twice', () => {
    const { state, login } = setup();

    const first = login.claim();
    expect(first.claimed).toBe(true);
    const afterFirst = state.coins;

    // The reboot.
    const second = login.claim();

    expect(second.claimed).toBe(false);
    expect(second.coins).toBe(0);
    expect(state.coins).toBe(afterFirst);
  });

  it('does not apply the away period twice', () => {
    const { state, stats } = setup(6);

    const first = stats.catchUp();
    expect(first.appliedHours).toBeGreaterThan(0);
    const statsAfterFirst = { ...state.snapshot.stats };

    const second = stats.catchUp();

    // `catchUp` advances `lastSeenUtc`, so the second pass sees no elapsed time
    // and must decay nothing further. That single field is the whole guard —
    // it is why a language switch can reboot the game without ageing the pet a
    // second time.
    expect(second.appliedHours).toBeLessThan(0.01);
    expect(state.snapshot.stats).toEqual(statsAfterFirst);
  });

  it('keeps the same task set, and its progress, across a reboot', () => {
    const { state, tasks } = setup();

    tasks.refreshDay();
    const drawn = tasks.list.map((view) => view.def.id);
    expect(drawn.length).toBeGreaterThan(0);

    const target = tasks.list[0];
    expect(target).toBeDefined();
    if (!target) return;
    tasks.report(target.def.trigger, 1);
    const progressed = state.taskCounts[target.def.id] ?? 0;
    expect(progressed).toBeGreaterThan(0);

    // The reboot.
    tasks.refreshDay();

    expect(tasks.list.map((view) => view.def.id)).toEqual(drawn);
    expect(state.taskCounts[target.def.id]).toBe(progressed);
  });

  it('does not re-award a task already claimed before the reboot', () => {
    const { state, tasks } = setup();
    tasks.refreshDay();

    const target = tasks.list[0];
    expect(target).toBeDefined();
    if (!target) return;

    tasks.report(target.def.trigger, target.def.target);
    expect(tasks.claim(target.def.id)).toBe(true);
    const afterClaim = state.coins;

    tasks.refreshDay();

    expect(tasks.claim(target.def.id)).toBe(false);
    expect(state.coins).toBe(afterClaim);
  });
});

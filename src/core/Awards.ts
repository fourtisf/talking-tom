/**
 * Lifetime milestones. The only thing in the game that accumulates.
 *
 * A sibling of `Tasks`, not a mode of it, and the difference is the point:
 * tasks are drawn fresh every morning and wiped every night, so they are a
 * reason to OPEN the app and never a reason to keep it. These count forever.
 *
 * ONE COUNTER PER TRIGGER, tiers layered on top. `feed10` and `feed250` both
 * read the same lifetime feed count, so a tier costs a line in `AWARDS` and
 * nothing here — and, more usefully, a player who fed her sixty times before
 * this shipped is not told they have fed her zero times. That only works
 * because the counts are derived from the same `xpGained` stream `Tasks`
 * already listens to, which has been running since the first release.
 *
 * CLAIMED, NOT AUTO-PAID. A gem that lands silently while the player is
 * scrubbing a cat is a gem they never knew they earned; the badge, the sheet
 * and the tap are the reward, and the gem is the receipt.
 */

import { AWARDS, type AwardDef, type TaskTrigger } from '@/config/tuning';
import type { Economy } from '@/core/Economy';
import { Emitter } from '@/core/EventBus';
import type { GameState } from '@/core/GameState';
import type { Progression } from '@/core/Progression';
import { analytics } from '@/services/Analytics';

export interface AwardView {
  readonly def: AwardDef;
  /** Lifetime count for this award's trigger, capped at the target. */
  readonly count: number;
  readonly done: boolean;
  readonly claimed: boolean;
}

export interface AwardsEvents {
  changed: void;
  claimed: { def: AwardDef; gems: number };
}

export class Awards {
  readonly events = new Emitter<AwardsEvents>();
  private readonly state: GameState;
  private readonly economy: Economy;
  private readonly progression: Progression;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(state: GameState, economy: Economy, progression: Progression) {
    this.state = state;
    this.economy = economy;
    this.progression = progression;
  }

  start(): void {
    this.unsubscribers.push(
      /*
       * Same stream `Tasks` counts off, and the same exclusion: a task's own
       * XP payout is not itself an action. Without that, claiming "feed 3
       * times" would tick the lifetime feed counter a fourth time.
       */
      this.progression.events.on('xpGained', ({ reason, count }) => {
        if (reason !== 'task') this.record(reason, count);
      }),
    );
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
  }

  /** Count `by` occurrences of `trigger` against every award watching it. */
  record(trigger: TaskTrigger, by = 1): void {
    if (by <= 0) return;
    /*
     * Recorded even when every award on this trigger is already claimed.
     *
     * The counter is the player's history, not a progress bar for the awards
     * that happen to exist today. Stopping at the last tier would mean a new
     * tier added in a later release opens at zero for the players who earned
     * it most.
     */
    this.state.advanceLifetime(trigger, by);
    this.events.emit('changed', undefined);
  }

  get list(): AwardView[] {
    const claimed = this.state.awardsClaimed;
    return AWARDS.map((def) => {
      const raw = this.state.lifetime[def.trigger] ?? 0;
      const count = Math.min(def.target, raw);
      return { def, count, done: count >= def.target, claimed: claimed.includes(def.id) };
    });
  }

  /**
   * Done and uncollected. Drives the badge, so it is what tells the player
   * there is anything in the sheet worth opening.
   */
  get claimableCount(): number {
    return this.list.filter((a) => a.done && !a.claimed).length;
  }

  /**
   * Sort order for the sheet: claimable, then in progress, then collected.
   *
   * Sixteen rows is more than fits on a phone, so the order IS the interface.
   * A flat list in definition order buries the one row with a button under
   * nine the player has already collected.
   */
  get sorted(): AwardView[] {
    const rank = (a: AwardView): number => (a.done && !a.claimed ? 0 : a.claimed ? 2 : 1);
    return [...this.list].sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      // Within "in progress", closest to done first — that is the one worth
      // showing someone who came here asking what to do next.
      const pa = a.count / a.def.target;
      const pb = b.count / b.def.target;
      return pb - pa;
    });
  }

  claim(id: string): boolean {
    const view = this.list.find((a) => a.def.id === id);
    if (!view || !view.done || view.claimed) return false;
    this.state.claimAward(id);
    this.economy.earnGems(view.def.gems, 'award');
    analytics.track('award_claimed', { award: id, gems: view.def.gems });
    this.events.emit('claimed', { def: view.def, gems: view.def.gems });
    this.events.emit('changed', undefined);
    return true;
  }
}

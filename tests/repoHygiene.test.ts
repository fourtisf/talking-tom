/**
 * Repo-wide checks for the acceptance criteria that are about *content* rather
 * than behaviour (§15):
 *
 *  - zero references to any competitor's brand anywhere in the repo (§2.2);
 *  - no direct `localStorage` use (§2.4);
 *  - every balance number resolves to `config/tuning.ts` (§3).
 *
 * These are cheap, and they fail the moment someone pastes in the wrong thing.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// `.claude` is agent tooling scratch space: throwaway git worktrees land there
// while a task runs. They are full copies of the repo, so scanning them both
// doubles the work and reports every finding twice under a path that does not
// exist in the commit.
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.claude',
  'android',
  'ios',
  'coverage',
]);
const CODE_EXT = new Set(['.ts', '.js', '.html', '.json', '.md']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE_EXT.has(extname(entry))) out.push(full);
  }
  return out;
}

/**
 * This file defines the banned patterns, so it must not scan itself. Matched by
 * filename rather than by path: that property belongs to the file, and an exact
 * path lets any copy of it — in a worktree, a backup, a vendored checkout —
 * report itself as a violation.
 */
const SELF = 'repoHygiene.test.ts';

/** Strip comments, so a rule can cite the thing it forbids without tripping. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FILES = walk(ROOT)
  .map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, 'utf8') }))
  .filter((f) => basename(f.path) !== SELF)
  .map((f) => ({ ...f, code: stripComments(f.text) }));

function sourceFiles(prefix: string): typeof FILES {
  return FILES.filter((f) => f.path.startsWith(prefix) && f.path.endsWith('.ts'));
}

describe('repo hygiene (§15)', () => {
  it('finds source files to scan (guards against a broken walk)', () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(sourceFiles('src/').length).toBeGreaterThan(15);
  });

  it('contains zero references to any competitor brand (§2.2)', () => {
    // Outfit7 enforces aggressively. The genre is open; their brand is not.
    const banned = [
      /talking\s*tom/i,
      /talking\s*angela/i,
      /talking\s*ben/i,
      /talking\s*ginger/i,
      /outfit\s*7/i,
      /my\s*talking/i,
    ];

    const hits: string[] = [];
    for (const file of FILES) {
      for (const pattern of banned) {
        if (pattern.test(file.text)) hits.push(`${file.path} matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('never touches localStorage or sessionStorage directly (§2.4)', () => {
    // Comments are stripped: explaining why it is banned is not using it.
    const hits = sourceFiles('src/')
      .filter((f) => /\b(?:window\.)?(?:localStorage|sessionStorage)\b/.test(f.code))
      .map((f) => f.path);
    expect(hits).toEqual([]);
  });

  it('keeps currency mutation inside Economy.ts (§7 / §15)', () => {
    const offenders = sourceFiles('src/')
      .filter((f) => f.path !== 'src/core/Economy.ts' && f.path !== 'src/core/GameState.ts')
      .filter((f) => /\.applyCurrency\s*\(/.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('imports the currency capability token only from Economy.ts', () => {
    const importers = sourceFiles('src/')
      .filter((f) => f.path !== 'src/core/currencyKey.ts')
      .filter((f) => /from '@\/core\/currencyKey'/.test(f.text))
      .map((f) => f.path);
    expect(importers).toEqual(['src/core/Economy.ts', 'src/core/GameState.ts']);
  });

  it('keeps balance numbers out of scenes, ui and pet code (§3)', () => {
    // Every gameplay quantity must come from tuning.ts. Scenes legitimately
    // hold layout numbers, so this checks the specific values that would mean
    // someone hard-coded a rule instead of importing it.
    const balanceValues = [
      { name: 'hunger decay per hour', pattern: /\b12\.5\b/ },
      { name: 'fun decay per hour', pattern: /\b16\.7\b/ },
      { name: 'clean decay per hour', pattern: /\b7\.1\b/ },
      { name: 'sleep energy regen', pattern: /\b25\s*\/\s*(?:hr|hour)/ },
      { name: 'offline cap hours', pattern: /\bOFFLINE_CAP\b/ },
      { name: 'rewarded ad payout', pattern: /\b150\s*(?:coins|\/\s*ad)/ },
      { name: 'xp curve exponent', pattern: /Math\.pow\([^)]*1\.35\)/ },
    ];

    const offenders: string[] = [];
    for (const file of [...sourceFiles('src/scenes/'), ...sourceFiles('src/ui/'), ...sourceFiles('src/pet/')]) {
      for (const value of balanceValues) {
        if (value.pattern.test(file.code)) offenders.push(`${file.path}: ${value.name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The design has always called for Fredoka, and for a long time BOTH pages
   * asked for it while neither shipped it — play.html even carried the
   * `@font-face` block commented out with a note to drop the file in. Every
   * player and every visitor saw whatever generic sans their platform happens
   * to have, which is most of what made the product look unfinished.
   *
   * Phaser rasterises a Text once at creation and never re-renders it, so a
   * missing font here is permanent for the session, not a flash of the wrong
   * face. Hence a test rather than a comment.
   */
  it('ships the display font it asks for, with its licence (§2 assets)', () => {
    const font = join(ROOT, 'public/fonts/fredoka.woff2');
    expect(statSync(font).size).toBeGreaterThan(10_000);

    // The OFL permits redistribution and requires the licence to travel with
    // the file. Serving the woff2 from biskit.fun IS redistribution.
    expect(statSync(join(ROOT, 'public/fonts/OFL-Fredoka.txt')).size).toBeGreaterThan(1000);

    for (const page of ['play.html', 'index.html']) {
      const html = readFileSync(join(ROOT, page), 'utf8');
      expect(html, `${page} must declare the face`).toMatch(
        /@font-face\s*\{[^}]*Fredoka/,
      );
      // Relative, not absolute: play.html is also the Capacitor bundle root,
      // where "/fonts/..." resolves against a server that is not there.
      expect(html, `${page} must reference the font relatively`).toContain(
        './fonts/fredoka.woff2',
      );
    }
  });

  it('routes every tuning import through config/tuning.ts, not a copy', () => {
    const tuningModules = sourceFiles('src/').filter((f) =>
      /export const (?:STAT_DECAY_PER_HOUR|EARN|XP_CURVE|OFFLINE)\b/.test(f.text),
    );
    expect(tuningModules.map((f) => f.path)).toEqual(['src/config/tuning.ts']);
  });
});

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
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'android', 'ios', 'coverage']);
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

/** This file defines the banned patterns, so it must not scan itself. */
const SELF = 'tests/repoHygiene.test.ts';

/** Strip comments, so a rule can cite the thing it forbids without tripping. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FILES = walk(ROOT)
  .map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, 'utf8') }))
  .filter((f) => f.path !== SELF)
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

  it('routes every tuning import through config/tuning.ts, not a copy', () => {
    const tuningModules = sourceFiles('src/').filter((f) =>
      /export const (?:STAT_DECAY_PER_HOUR|EARN|XP_CURVE|OFFLINE)\b/.test(f.text),
    );
    expect(tuningModules.map((f) => f.path)).toEqual(['src/config/tuning.ts']);
  });
});

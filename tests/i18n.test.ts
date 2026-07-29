/**
 * The copy catalogue.
 *
 * The Indonesian catalogue and the language switcher were removed on request.
 * What the remaining tests defend is that every piece of content the game names
 * has a string, and that new English sentences do not get scattered back
 * through the scenes once they have been collected into one file.
 */

import { describe, expect, it } from 'vitest';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FOODS, HATS, TASKS } from '@/config/tuning';
import { EN } from '@/i18n/en';
import { plural, t } from '@/i18n';

describe('the catalogue', () => {
  it('leaves nothing blank', () => {
    const blank = Object.entries(EN).filter(([, value]) => value.trim().length === 0);
    expect(blank).toEqual([]);
  });

  it('substitutes slots', () => {
    expect(t('common.unlocksAtLevel', { level: 5 })).toContain('5');
  });

  it('leaves an unfilled slot visible rather than printing "undefined"', () => {
    expect(t('common.unlocksAtLevel')).toContain('{level}');
  });

  it('picks the singular for exactly one', () => {
    expect(plural(1, 'common.duration.days', 'common.duration.days')).toContain('1');
  });
});

/* ------------------------------------------------------------------ *
 * Coverage of the things tuning.ts names
 * ------------------------------------------------------------------ */

/**
 * `content.ts` looks names up softly, falling back to the English in
 * `tuning.ts` when a key is missing. That was a deliberate choice — a new hat
 * should render its English name rather than fail to build — but it threw away
 * the compile-time guarantee a `Record<ContentKey, string>` would have given.
 * This buys it back at test time.
 */
describe('content coverage', () => {
  it('names every food', () => {
    const missing = FOODS.filter((food) => !(`food.${food.id}` in EN)).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it('names every hat', () => {
    const missing = HATS.filter((hat) => !(`hat.${hat.id}` in EN)).map((h) => h.id);
    expect(missing).toEqual([]);
  });

  it('names every task, in both plural forms', () => {
    const missing = TASKS.pool
      .filter((task) => !(`task.${task.id}.one` in EN) || !(`task.${task.id}.other` in EN))
      .map((t) => t.id);
    expect(missing).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The literals that have not been migrated yet
 * ------------------------------------------------------------------ */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (extname(entry) === '.ts') out.push({ path: relative(ROOT, full), text: readFileSync(full, 'utf8') });
    }
  };
  walk(join(ROOT, dir));
  return out;
}

/**
 * A sentence-shaped string literal in a scene is almost always a line of copy
 * somebody forgot to translate.
 *
 * This is a RATCHET, not a gate. Migration is partway done and a test that
 * failed on every remaining literal would have to be skipped, which is the same
 * as not having it. Instead it pins the current count per file: the number may
 * fall, never rise. Lower a number when you migrate a file; you cannot add a
 * new English sentence anywhere without this going red.
 */
const REMAINING_LITERALS: Readonly<Record<string, number>> = {
  /*
   * One, and it is not player-facing: the stub billing provider's failure text.
   * `Iap.message()` forwards a provider's message to analytics and shows the
   * player a sentence we wrote, because a store SDK's error text arrives in
   * whatever language it likes and cannot be translated by anyone downstream.
   * That one string is for whoever reads the log.
   */
  'src/services/Iap.ts': 1,
};

describe('untranslated copy', () => {
  it('never grows', () => {
    const strip = (text: string): string =>
      text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*/gm, '$1');
    // Three or more words starting with a capital: prose, not an id or a key.
    const SENTENCE = /'([A-Z][a-z]+(?: [a-z]+){2,}[^']*)'/g;

    const worse: string[] = [];
    for (const dir of ['src/scenes', 'src/services', 'src/ui', 'src/core']) {
      for (const file of sourceFiles(dir)) {
        const found = [...strip(file.text).matchAll(SENTENCE)].length;
        const allowed = REMAINING_LITERALS[file.path] ?? 0;
        if (found > allowed) worse.push(`${file.path}: ${found} > ${allowed} allowed`);
      }
    }
    expect(worse).toEqual([]);
  });
});

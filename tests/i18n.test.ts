/**
 * The i18n layer.
 *
 * The failure being designed against is not a wrong translation — it is an
 * English string quietly surviving into an Indonesian build, which is exactly
 * the state the whole game was in. So the tests that matter are about
 * COVERAGE and about detection, not about vocabulary.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FOODS, HATS, TASKS } from '@/config/tuning';
import { EN } from '@/i18n/en';
import { ID } from '@/i18n/id';
import { LOCALES, LOCALE_NAME, detectLocale, getLocale, isLocale, plural, setLocale, t } from '@/i18n';

afterEach(() => setLocale('en'));

describe('catalogues', () => {
  it('translates every English key', () => {
    const missing = Object.keys(EN).filter((key) => !(key in ID));
    expect(missing).toEqual([]);
  });

  it('has no Indonesian key that English does not define', () => {
    const extra = Object.keys(ID).filter((key) => !(key in EN));
    expect(extra).toEqual([]);
  });

  it('leaves nothing blank', () => {
    const blank = Object.entries(ID).filter(([, value]) => value.trim().length === 0);
    expect(blank).toEqual([]);
  });

  /**
   * A `{slot}` in English that is absent from the Indonesian string is a value
   * the player never sees — a level number, a coin amount, a streak. Silent,
   * and only visible to someone who reads the language.
   */
  it('keeps every interpolation slot in both languages', () => {
    const slots = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

    const mismatched: string[] = [];
    for (const [key, english] of Object.entries(EN)) {
      const indonesian = ID[key as keyof typeof EN];
      if (JSON.stringify(slots(english)) !== JSON.stringify(slots(indonesian))) {
        mismatched.push(`${key}: en=${slots(english).join()} id=${slots(indonesian).join()}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('names every locale it ships', () => {
    for (const locale of LOCALES) expect(LOCALE_NAME[locale].length).toBeGreaterThan(1);
  });
});

describe('t()', () => {
  it('returns the current language', () => {
    setLocale('en');
    const english = t('nav.home');
    setLocale('id');
    expect(t('nav.home')).not.toBe(english);
  });

  it('substitutes slots', () => {
    setLocale('en');
    expect(t('common.unlocksAtLevel', { level: 5 })).toContain('5');
  });

  it('leaves an unfilled slot visible rather than printing "undefined"', () => {
    setLocale('en');
    expect(t('common.unlocksAtLevel')).toContain('{level}');
  });

  it('falls back to English for a key the other catalogue somehow lacks', () => {
    setLocale('id');
    // Cast: the point is behaviour when the type system has been circumvented,
    // which is what a hand-edited catalogue or a bad merge looks like.
    const partial = ID as Record<string, string>;
    const key = 'nav.home';
    const saved = partial[key];
    delete partial[key];
    expect(t('nav.home')).toBe(EN['nav.home']);
    partial[key] = saved ?? '';
  });
});

describe('detectLocale', () => {
  it('picks Indonesian from an Indonesian device', () => {
    expect(detectLocale(['id-ID', 'en-US'])).toBe('id');
  });

  /**
   * `in` is the deprecated ISO code for Indonesian and some Android webviews
   * still emit it. A user whose phone is set to Indonesian getting an English
   * game because of a 1989 tag rename is precisely what this module exists to
   * prevent.
   */
  it('accepts the legacy "in" tag Android still emits', () => {
    expect(detectLocale(['in-ID'])).toBe('id');
    expect(detectLocale(['in'])).toBe('id');
  });

  it('falls back rather than guessing at a language we do not ship', () => {
    expect(detectLocale(['fr-FR', 'de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('respects the order the device gave', () => {
    expect(detectLocale(['en-GB', 'id'])).toBe('en');
  });
});

describe('locale state', () => {
  it('round-trips and validates', () => {
    expect(isLocale('id')).toBe(true);
    expect(isLocale('klingon')).toBe(false);
    setLocale('id');
    expect(getLocale()).toBe('id');
  });
});

describe('plural()', () => {
  it('picks the singular for exactly one', () => {
    setLocale('en');
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
  'src/scenes/HomeScene.ts': 7,
  'src/scenes/SettingsScene.ts': 6,
  'src/services/Ads.ts': 2,
  'src/services/Iap.ts': 2,
  'src/services/VoiceMimic.ts': 2,
  'src/scenes/CopycatScene.ts': 1,
};

describe('untranslated copy', () => {
  it('never grows', () => {
    const strip = (text: string): string =>
      text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*/gm, '$1');
    // Three or more words starting with a capital: prose, not an id or a key.
    const SENTENCE = /'([A-Z][a-z]+(?: [a-z]+){2,}[^']*)'/g;

    const worse: string[] = [];
    for (const dir of ['src/scenes', 'src/services', 'src/ui']) {
      for (const file of sourceFiles(dir)) {
        const found = [...strip(file.text).matchAll(SENTENCE)].length;
        const allowed = REMAINING_LITERALS[file.path] ?? 0;
        if (found > allowed) worse.push(`${file.path}: ${found} > ${allowed} allowed`);
      }
    }
    expect(worse).toEqual([]);
  });
});

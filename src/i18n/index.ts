/**
 * Translation lookup.
 *
 * The game was written entirely in English and is being marketed in Indonesian,
 * which is two decisions that contradict each other. This is the layer that
 * resolves it.
 *
 * SYNCHRONOUS on purpose. Phaser rasterises a `Text` object once, at creation,
 * into a canvas texture — it never re-renders when something arrives later. An
 * async catalogue would mean every label in the game drawing its own key for a
 * frame and then keeping it forever. Both catalogues are small enough
 * (~4KB each) that bundling them costs less than the machinery to avoid it.
 */

import { LOCALE } from '@/config/tuning';
import { EN, type MessageKey } from '@/i18n/en';
import { ID } from '@/i18n/id';

export type { MessageKey };

export type Locale = 'en' | 'id';

export const LOCALES: readonly Locale[] = ['en', 'id'];

/** What the Language row shows for each — always in that language. */
export const LOCALE_NAME: Readonly<Record<Locale, string>> = {
  en: 'English',
  id: 'Bahasa Indonesia',
};

const CATALOGUES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  en: EN,
  id: ID,
};

let current: Locale = 'en';

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick a locale from what the browser reports.
 *
 * `in` is checked as well as `id`: it is the deprecated ISO code for
 * Indonesian, and Android still emits it from some webviews. A user whose phone
 * is in Indonesian getting an English game because of a 1989 tag rename is the
 * exact failure this whole module exists to prevent.
 */
export function detectLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'id' || base === 'in') return 'id';
    if (base === 'en') return 'en';
  }
  return LOCALE.fallback;
}

/**
 * Look up `key`, substituting `{name}` slots from `params`.
 *
 * A missing key returns the key itself rather than an empty string: a label
 * reading `shop.title` is an obvious bug on sight, whereas a blank one looks
 * like a layout problem and gets chased in the wrong file. In dev it also
 * warns, so it is caught before anyone has to see it.
 */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const template = CATALOGUES[current][key] ?? EN[key];

  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] ${key}: no value for {${name}}`);
      return whole;
    }
    return String(value);
  });
}

/**
 * Pick between a singular and a plural key.
 *
 * Indonesian does not inflect for number, so both of its forms are usually the
 * same string — but English needs the pair, and the call site should not have
 * to know which language it is in.
 */
export function plural(
  n: number,
  one: MessageKey,
  many: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  return t(n === 1 ? one : many, { n, ...params });
}

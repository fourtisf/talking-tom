/**
 * Player-facing copy, in one place.
 *
 * This started as a translation layer with an Indonesian catalogue alongside
 * the English one and a Language row in Settings. That was removed on request:
 * the game ships in English only, and a switcher nobody wanted was carrying a
 * scene-restart path that broke every overlay in the game.
 *
 * What is kept is the lookup. The alternative was putting ~200 sentences back
 * inline across fifteen files, which is a large diff with real regression risk
 * and nothing a player would ever see. As a single catalogue it still earns its
 * place: every string the game says is in one file, `tests/i18n.test.ts` checks
 * that every food, hat and task has a name, and the ratchet in that same file
 * stops new English sentences being scattered back through the scenes.
 *
 * SYNCHRONOUS, and deliberately so. Phaser rasterises a `Text` object once, at
 * creation, into a canvas texture — it never re-renders when something arrives
 * later. Anything async here would mean labels drawing their own key for a
 * frame and then keeping it forever.
 */

import { EN, type MessageKey } from '@/i18n/en';

export type { MessageKey };

/**
 * Look up `key`, substituting `{name}` slots from `params`.
 *
 * A missing key returns the key itself rather than an empty string: a label
 * reading `shop.title` is an obvious bug on sight, whereas a blank one looks
 * like a layout problem and gets chased in the wrong file.
 */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const template = EN[key];

  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`[copy] missing key: ${key}`);
    return key;
  }
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) {
      if (import.meta.env.DEV) console.warn(`[copy] ${key}: no value for {${name}}`);
      return whole;
    }
    return String(value);
  });
}

/** Pick between a singular and a plural key, passing `n` through as a slot. */
export function plural(
  n: number,
  one: MessageKey,
  many: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  return t(n === 1 ? one : many, { n, ...params });
}

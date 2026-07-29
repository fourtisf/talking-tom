/**
 * Names for the things in `tuning.ts`.
 *
 * `FoodDef.name` and `HatDef.name` stay in the balance file as ENGLISH
 * fallbacks and as something readable in a debug log, but nothing player-facing
 * reads them any more — these helpers do the lookup instead.
 *
 * Why not delete the `name` fields outright, which is the tidier design? Because
 * the id and the display name would then live in two files that nothing forces
 * to agree, and a new hat added to `HATS` without a matching catalogue entry
 * would render as a blank card rather than failing to build. The fallback keeps
 * that failure visible AND harmless: the shop shows "Rainbow" until somebody
 * writes the translation.
 */

import { t, type MessageKey } from '@/i18n';
import { EN } from '@/i18n/en';

function lookup(prefix: string, id: string, fallback: string): string {
  const key = `${prefix}.${id}`;
  return key in EN ? t(key as MessageKey) : fallback;
}

export function foodName(id: string, fallback: string): string {
  return lookup('food', id, fallback);
}

export function hatName(id: string, fallback: string): string {
  return lookup('hat', id, fallback);
}

/**
 * Daily task labels. These carry the numbers the task is counting, so they
 * interpolate rather than being a flat lookup.
 */
export function taskLabel(id: string, target: number, fallback: string): string {
  // Stored as a singular/plural pair. Indonesian does not inflect for number,
  // so both of its forms are identical — but English needs the pair, and the
  // call site should not have to know which language it is rendering.
  const key = `task.${id}.${target === 1 ? 'one' : 'other'}`;
  return key in EN ? t(key as MessageKey, { n: target }) : fallback;
}

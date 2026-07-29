/**
 * Backup codes — the only way a player can not lose the pet.
 *
 * Saves are local. On the web, Capacitor Preferences falls back to browser
 * storage, so "clear browsing data" destroys a level-14 cat permanently, and
 * there is no account to restore from. For a game whose whole pitch is that
 * she remembers you, that was the single largest retention risk in the
 * product. This is the cheapest honest fix: a copy-pasteable string, no
 * backend, no account, no email address.
 *
 * FORMAT  BSKT1.<base64url of the JSON save>.<fnv1a checksum, base36>
 *
 *  - the version segment is checked BEFORE anything is parsed, so a code from a
 *    future build is refused with an explanation instead of being half-read;
 *  - the checksum catches a code truncated by a chat client's line wrapping,
 *    which is the failure this will actually see, rather than any attack;
 *  - base64url and a single line, because the code has to survive being pasted
 *    through a messaging app.
 *
 * WHY NAMED KEYS AND NOT A POSITIONAL ARRAY. Positional would roughly halve the
 * code, 806 characters down to 363, and it would couple the format to the field
 * ORDER of SaveData — so reordering two lines in a type definition would
 * silently corrupt every backup anyone had written down. `validate()` already
 * tolerates missing, unknown and reordered fields; keeping named keys is what
 * lets it. The extra 400 characters buy that, and a backup code is pasted, not
 * typed.
 */

import { checksum, validate } from '@/core/SaveManager';
import { t, type MessageKey } from '@/i18n';
import type { SaveData } from '@/core/types';

/** Bump only when the code format itself changes, not on save schema bumps. */
export const SAVE_CODE_VERSION = 'BSKT1';

export type SaveCodeError = 'empty' | 'format' | 'version' | 'checksum' | 'corrupt';

export interface SaveCodeFailure {
  readonly ok: false;
  readonly reason: SaveCodeError;
}

export interface SaveCodeSuccess {
  readonly ok: true;
  readonly data: SaveData;
}

/**
 * Human-facing, and specific: "invalid code" tells the player nothing.
 *
 * A FUNCTION rather than a constant record, because the catalogue is chosen at
 * runtime and a module-level record would freeze whichever language happened to
 * be current when this file was first imported — which is before the stored
 * preference has been read off disk.
 */
export function saveCodeMessage(reason: SaveCodeError): string {
  return t(SAVE_CODE_KEY[reason]);
}

const SAVE_CODE_KEY: Readonly<Record<SaveCodeError, MessageKey>> = {
  empty: 'save.error.empty',
  format: 'save.error.format',
  version: 'save.error.version',
  checksum: 'save.error.checksum',
  corrupt: 'save.error.corrupt',
};

function toBase64Url(text: string): string {
  // `btoa` is byte-oriented, so anything non-ASCII has to be escaped first.
  // Save data is ASCII today; this stops a future field with an accented
  // character from throwing at the moment a player tries to back up.
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * The code carries the sync TOKEN as well as the save.
 *
 * Without it, restoring on a new device gives you the pet but a fresh identity
 * — the server would keep two separate saves and the old device would keep
 * overwriting nothing anyone reads. With it, "paste your code" is genuinely
 * "become that player again", which is the only sentence about this that a
 * player should have to understand.
 *
 * It also means a backup code is a credential. The dialog already says to treat
 * it like a password; this is why that is not boilerplate.
 */
export function encodeSaveCode(data: SaveData, syncToken?: string | null): string {
  const payload = syncToken ? { ...data, syncToken } : data;
  const json = JSON.stringify(payload);
  return `${SAVE_CODE_VERSION}.${toBase64Url(json)}.${checksum(json).toString(36)}`;
}

/** The token a code carries, if any. `validate` drops it from the save itself. */
export function syncTokenFromCode(code: string): string | null {
  const parts = code.trim().replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== SAVE_CODE_VERSION) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(parts[1] ?? ''));
    const token = (parsed as { syncToken?: unknown } | null)?.syncToken;
    return typeof token === 'string' && /^[0-9a-f]{32}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * Never throws and never half-applies: either a complete `SaveData` comes back
 * or a reason does. The caller overwrites a live pet with the result, so a
 * partial read is the one outcome that must be impossible.
 */
export function decodeSaveCode(code: string, nowMs: number): SaveCodeSuccess | SaveCodeFailure {
  // Chat clients wrap, and players paste with stray whitespace either side.
  const cleaned = code.trim().replace(/\s+/g, '');
  if (cleaned.length === 0) return { ok: false, reason: 'empty' };

  const parts = cleaned.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'format' };

  const [version, payload, stamp] = parts as [string, string, string];
  if (!version.startsWith('BSKT')) return { ok: false, reason: 'format' };
  if (version !== SAVE_CODE_VERSION) return { ok: false, reason: 'version' };

  let json: string;
  try {
    json = fromBase64Url(payload);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }

  if (checksum(json).toString(36) !== stamp) return { ok: false, reason: 'checksum' };

  try {
    const parsed: unknown = JSON.parse(json);
    // Straight through the same validator a save off disk goes through, so a
    // hand-edited code cannot ride in with a 9999 stat or a negative balance.
    return { ok: true, data: validate(parsed, nowMs) };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

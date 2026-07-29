/**
 * Backup codes. The contract that matters is not "a code round-trips" — it is
 * that a code which is NOT good is refused rather than half-applied, because
 * the caller overwrites a live pet with the result.
 */

import { describe, expect, it } from 'vitest';

import { createDefaultSave } from '@/core/GameState';
import { SAVE_CODE_MESSAGE, SAVE_CODE_VERSION, decodeSaveCode, encodeSaveCode } from '@/core/saveCode';
import type { SaveData } from '@/core/types';

const T0 = Date.UTC(2026, 6, 29, 9, 0, 0);

function richSave(): SaveData {
  const save = createDefaultSave(T0);
  save.coins = 1240;
  save.gems = 14;
  save.level = 9;
  save.xp = 233;
  save.ownedItems = ['bloom', 'beanie', 'halo'];
  save.equipped = { hat: 'halo', outfit: null };
  save.totalPlaySeconds = 18_400;
  save.dailyLoginStreak = 5;
  save.taskDayKey = '2026-07-29';
  save.taskIds = ['feed3', 'catch8', 'happy'];
  save.taskCounts = { feed3: 2 };
  save.tutorialStep = -1;
  save.stats = { hunger: 62, energy: 74, fun: 48, clean: 70 };
  return save;
}

describe('save codes', () => {
  it('round-trips a whole pet', () => {
    const original = richSave();
    const result = decodeSaveCode(encodeSaveCode(original), T0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.level).toBe(9);
    expect(result.data.coins).toBe(1240);
    expect(result.data.gems).toBe(14);
    expect(result.data.ownedItems).toEqual(['bloom', 'beanie', 'halo']);
    expect(result.data.equipped.hat).toBe('halo');
    expect(result.data.taskIds).toEqual(['feed3', 'catch8', 'happy']);
    expect(result.data.stats).toEqual({ hunger: 62, energy: 74, fun: 48, clean: 70 });
  });

  it('is one line, url-safe, and version-stamped', () => {
    const code = encodeSaveCode(richSave());
    expect(code.startsWith(`${SAVE_CODE_VERSION}.`)).toBe(true);
    expect(code).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(code).not.toContain('\n');
  });

  it('survives the whitespace a chat client adds', () => {
    const code = encodeSaveCode(richSave());
    // Wrapped mid-code and padded, which is what a paste out of a messenger
    // actually looks like.
    const mangled = `  ${code.slice(0, 40)}\n${code.slice(40, 300)}\n  ${code.slice(300)}  `;
    const result = decodeSaveCode(mangled, T0);
    expect(result.ok).toBe(true);
  });

  it('refuses a truncated code instead of importing a partial pet', () => {
    const code = encodeSaveCode(richSave());
    const result = decodeSaveCode(code.slice(0, code.length - 6), T0);
    expect(result).toEqual({ ok: false, reason: 'checksum' });
  });

  it('refuses a code whose payload was edited', () => {
    const code = encodeSaveCode(richSave());
    const parts = code.split('.');
    // Flip one character in the payload, keeping the checksum — exactly what a
    // "give myself more coins" edit looks like.
    const payload = parts[1] ?? '';
    const tampered = `${parts[0]}.${payload.slice(0, 20)}Z${payload.slice(21)}.${parts[2]}`;
    expect(decodeSaveCode(tampered, T0).ok).toBe(false);
  });

  it('refuses a code from a newer build by version, before parsing', () => {
    const code = encodeSaveCode(richSave());
    const future = `BSKT9.${code.split('.').slice(1).join('.')}`;
    expect(decodeSaveCode(future, T0)).toEqual({ ok: false, reason: 'version' });
  });

  it('names every failure it can produce', () => {
    for (const [input, reason] of [
      ['', 'empty'],
      ['   ', 'empty'],
      ['hello world', 'format'],
      ['BSKT1.onlytwo', 'format'],
      ['NOPE1.abc.def', 'format'],
    ] as const) {
      const result = decodeSaveCode(input, T0);
      expect(result, `for ${JSON.stringify(input)}`).toEqual({ ok: false, reason });
      expect(SAVE_CODE_MESSAGE[reason].length).toBeGreaterThan(10);
    }
  });

  it('sanitises a hand-built code through the same validator as a disk save', () => {
    // Someone reconstructs a code by hand with impossible values. The checksum
    // has to agree for it to get this far, so this is a player who worked for
    // it — and the clamp still holds.
    const cheat = { ...richSave(), coins: -50, level: 0, stats: { hunger: 9999, energy: 74, fun: 48, clean: 70 } };
    const result = decodeSaveCode(encodeSaveCode(cheat as SaveData), T0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.coins).toBe(0);
    expect(result.data.level).toBe(1);
    expect(result.data.stats.hunger).toBe(100);
  });
});

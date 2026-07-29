/**
 * Save sync.
 *
 * What is being defended is not "the happy path uploads". It is that the
 * network being absent, slow, hostile or confused never costs a player their
 * pet, and that two devices holding two copies resolve to the newer one rather
 * than to whichever spoke last.
 */

import { describe, expect, it, vi } from 'vitest';

import { CloudSave, isSyncToken, mintToken } from '@/core/CloudSave';
import { MemoryStore } from '@/core/storage';
import { createDefaultSave } from '@/core/GameState';
import { SYNC } from '@/config/tuning';
import type { SaveData } from '@/core/types';

const T0 = Date.UTC(2026, 6, 29, 9, 0, 0);
const ENDPOINT = '/api';

function save(rev: number): SaveData {
  const data = createDefaultSave(T0);
  data.rev = rev;
  data.level = rev + 1;
  return data;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function make(fetchImpl: typeof fetch, store = new MemoryStore()) {
  return { store, cloud: new CloudSave({ store, fetchImpl, endpoint: ENDPOINT }) };
}

describe('tokens', () => {
  it('mints 32 hex characters, which is the shape the server accepts', () => {
    for (let i = 0; i < 20; i++) expect(isSyncToken(mintToken())).toBe(true);
  });

  it('does not mint the same token twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintToken()));
    expect(seen.size).toBe(200);
  });

  it('rejects anything that could walk out of the data directory', () => {
    for (const bad of ['../../etc/passwd', 'ABCDEF', '', 'a'.repeat(31), 'a'.repeat(33), null, 42]) {
      expect(isSyncToken(bad)).toBe(false);
    }
  });

  it('persists the token, so the same device keeps the same save', async () => {
    const { store, cloud } = make(vi.fn());
    const first = await cloud.loadToken();
    const second = await new CloudSave({ store, fetchImpl: vi.fn(), endpoint: ENDPOINT }).loadToken();
    expect(second).toBe(first);
  });

  it('replaces a corrupt stored token rather than sending it', async () => {
    const store = new MemoryStore();
    await store.set(SYNC.tokenKey, 'not-a-token');
    const cloud = new CloudSave({ store, fetchImpl: vi.fn(), endpoint: ENDPOINT });
    expect(isSyncToken(await cloud.loadToken())).toBe(true);
  });

  it('mints one anyway when storage refuses, so play is never blocked', async () => {
    const broken = {
      get: vi.fn().mockRejectedValue(new Error('nope')),
      set: vi.fn().mockRejectedValue(new Error('nope')),
      remove: vi.fn().mockRejectedValue(new Error('nope')),
    };
    const cloud = new CloudSave({ store: broken, fetchImpl: vi.fn(), endpoint: ENDPOINT });
    expect(isSyncToken(await cloud.loadToken())).toBe(true);
  });
});

describe('disabled by default', () => {
  it('does nothing at all without an endpoint', async () => {
    const fetchImpl = vi.fn();
    const cloud = new CloudSave({ store: new MemoryStore(), fetchImpl, endpoint: '' });
    expect(cloud.enabled).toBe(false);
    expect(await cloud.push(save(1))).toEqual({ status: 'off' });
    expect(await cloud.pull()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('push', () => {
  it('sends the save with its revision', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, rev: 4 }));
    const { cloud } = make(fetchImpl);

    expect(await cloud.push(save(4))).toEqual({ status: 'pushed', rev: 4 });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/save');
    const body = JSON.parse(String(init.body)) as { token: string; rev: number };
    expect(isSyncToken(body.token)).toBe(true);
    expect(body.rev).toBe(4);
  });

  /**
   * The case that matters: a phone offline for a week comes back holding an old
   * revision. Retrying would overwrite a week of play from another device, so a
   * refusal must be reported, never retried.
   */
  it('reports a refusal instead of retrying over the newer save', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(409, { error: 'stale', rev: 9 }));
    const { cloud } = make(fetchImpl);
    expect(await cloud.push(save(2))).toEqual({ status: 'current' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a dead network as offline, not as an error to show anyone', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { cloud } = make(fetchImpl);
    expect(await cloud.push(save(1))).toEqual({ status: 'offline' });
  });

  it('survives a server 500', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'server' }));
    const { cloud } = make(fetchImpl);
    expect(await cloud.push(save(1))).toEqual({ status: 'offline' });
  });
});

describe('pull', () => {
  it('returns what the server holds', async () => {
    const remote = save(7);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { rev: 7, data: remote }));
    const { cloud } = make(fetchImpl);

    const result = await cloud.pull();
    expect(result?.rev).toBe(7);
    expect((result?.data as SaveData).level).toBe(8);
  });

  it('treats "nothing stored yet" as nothing, not as a failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'not_found' }));
    const { cloud } = make(fetchImpl);
    expect(await cloud.pull()).toBeNull();
  });

  /**
   * A hostile or broken server must not be able to hand back something the
   * caller will feed into the save path. Shape is checked before it is trusted;
   * `SaveManager.validate` is the second line, not the only one.
   */
  it('refuses a malformed body rather than passing it on', async () => {
    for (const body of [{}, { rev: 'x', data: {} }, { rev: 3 }, { rev: 3, data: null }, { rev: 0, data: {} }]) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, body));
      const { cloud } = make(fetchImpl);
      expect(await cloud.pull()).toBeNull();
    }
  });

  it('refuses a body that is not JSON at all', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>captive portal</html>', { status: 200 }));
    const { cloud } = make(fetchImpl);
    expect(await cloud.pull()).toBeNull();
  });

  it('gives up rather than hanging boot forever', async () => {
    // A fetch that never settles unless aborted — a captive portal, in effect.
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;

    const { cloud } = make(fetchImpl);
    vi.useFakeTimers();
    const pending = cloud.pull();
    await vi.advanceTimersByTimeAsync(SYNC.timeoutMs + 100);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });
});

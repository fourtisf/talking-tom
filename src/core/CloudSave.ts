/**
 * Save sync against our own server.
 *
 * The local save is still the source of truth for playing — the game never
 * waits on the network to start, and it stays entirely playable with the server
 * down or unreachable. This is a copy kept off the device so that "clear
 * browsing data", a lost phone or a new browser is an inconvenience rather than
 * the end of a level 14 cat.
 *
 * IDENTITY IS A TOKEN, NOT AN ACCOUNT. The client mints 128 random bits on
 * first run and keeps them beside the save. There is no email, no password and
 * nothing to forget. The cost is that the token IS the credential: whoever
 * holds it can read and overwrite that save. It therefore travels only inside
 * the backup code, which is already the thing we tell players to guard.
 *
 * CONFLICTS ARE DECIDED BY A COUNTER, NOT A CLOCK. `SaveData.rev` increments on
 * every local write. Higher wins. Phone clocks disagree by minutes and
 * occasionally by years, and a timestamp rule hands victory permanently to
 * whichever device is set furthest ahead.
 */

import { SYNC } from '@/config/tuning';
import type { KeyValueStore } from '@/core/storage';
import type { SaveData } from '@/core/types';
import { analytics } from '@/services/Analytics';

export type SyncOutcome =
  | { status: 'off' }
  | { status: 'pushed'; rev: number }
  | { status: 'pulled'; rev: number; data: SaveData }
  | { status: 'current' }
  | { status: 'offline' };

/** 32 lowercase hex characters — the shape the server validates against. */
export function isSyncToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

export function mintToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CloudSaveOptions {
  readonly store: KeyValueStore;
  /** Injected so tests do not need a socket. */
  readonly fetchImpl?: typeof fetch;
  /** Empty disables sync entirely, which is the default for a local build. */
  readonly endpoint?: string;
}

export class CloudSave {
  private readonly store: KeyValueStore;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;
  private token: string | null = null;

  constructor(options: CloudSaveOptions) {
    this.store = options.store;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.endpoint = (options.endpoint ?? SYNC.endpoint).replace(/\/$/, '');
  }

  get enabled(): boolean {
    return this.endpoint.length > 0;
  }

  get currentToken(): string | null {
    return this.token;
  }

  /**
   * Load the token, minting one on first run.
   *
   * Stored under its own key, never inside `SaveData`: importing somebody's
   * backup code should adopt their pet, and their token with it, but a save
   * that has been reset locally must not lose the identity the server knows it
   * by.
   */
  async loadToken(): Promise<string> {
    if (this.token) return this.token;
    let stored: string | null = null;
    try {
      stored = await this.store.get(SYNC.tokenKey);
    } catch {
      // Unreadable storage: mint a fresh one rather than refusing to play.
    }
    if (isSyncToken(stored)) {
      this.token = stored;
      return stored;
    }
    const minted = mintToken();
    this.token = minted;
    try {
      await this.store.set(SYNC.tokenKey, minted);
    } catch {
      // Sync will simply not persist across sessions. The game is unaffected.
    }
    return minted;
  }

  /** Adopt a token that arrived with an imported backup code. */
  async adoptToken(token: string): Promise<void> {
    if (!isSyncToken(token)) return;
    this.token = token;
    try {
      await this.store.set(SYNC.tokenKey, token);
    } catch {
      // As above.
    }
  }

  private url(path: string): string {
    return `${this.endpoint}${path}`;
  }

  /**
   * Fetch with a timeout.
   *
   * Without one a captive portal or a stalled connection leaves the request
   * hanging for the platform default, which on some webviews is minutes — and
   * boot waits on the pull.
   */
  private async request(path: string, init?: RequestInit): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC.timeoutMs);
    try {
      return await this.fetchImpl(this.url(path), { ...init, signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * What the server holds, or null if it holds nothing / cannot be reached.
   * A missing save is not an error: it is what every first run looks like.
   */
  async pull(): Promise<{ rev: number; data: unknown } | null> {
    if (!this.enabled) return null;
    const token = await this.loadToken();
    const response = await this.request(`/save?token=${token}`);
    if (!response || !response.ok) return null;
    try {
      const body = (await response.json()) as { rev?: unknown; data?: unknown };
      const rev = Number(body.rev);
      if (!Number.isInteger(rev) || rev < 1 || typeof body.data !== 'object' || body.data === null) {
        return null;
      }
      return { rev, data: body.data };
    } catch {
      return null;
    }
  }

  /**
   * Send the local save up.
   *
   * Never throws and never blocks anything the player is doing. A refusal
   * because the server holds something newer is reported rather than retried:
   * the caller pulls instead, which is the only safe direction.
   */
  async push(data: SaveData): Promise<SyncOutcome> {
    if (!this.enabled) return { status: 'off' };
    const token = await this.loadToken();

    const response = await this.request('/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, rev: data.rev, data }),
    });

    if (!response) return { status: 'offline' };
    if (response.status === 409) {
      analytics.track('sync_stale', { rev: data.rev });
      return { status: 'current' };
    }
    if (!response.ok) {
      analytics.track('sync_failed', { status: response.status });
      return { status: 'offline' };
    }
    return { status: 'pushed', rev: data.rev };
  }
}

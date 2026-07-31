/**
 * Getting a picture of Biskit out of the game.
 *
 * WHY THIS EXISTS. Every other feature in here deepens the game for someone
 * already playing it. This one is the only thing that reaches anyone who is
 * not — the owner has been recording the game by hand to post it, and the
 * player has six outfits, ten hats and six rooms and no way to show any of it
 * to anybody. Dress her up, take a photo, send it: that is the loop, and it is
 * the cheapest audience the game will ever get.
 *
 * Split into a PORT and a composer for the usual reason — the composer is
 * pixels and runs anywhere, the port is a platform API that behaves
 * differently in four places:
 *
 *   - Chrome/Safari on a phone: `navigator.share` takes a File. Works.
 *   - Desktop browsers: usually no `canShare({files})`. Falls back to a
 *     download, which is what a desktop user wanted anyway.
 *   - An Android Capacitor WebView: `navigator.share` is NOT there. The system
 *     sheet has to come from the native plugin, and the plugin needs a real
 *     file on disk first, so the blob is written through Filesystem.
 *   - Tests: neither exists. A null port reports `unsupported` and nothing
 *     throws.
 *
 * A share that quietly does nothing is worse than a button that is not there,
 * so every path returns a named outcome and the caller says which one happened.
 */

import { analytics } from '@/services/Analytics';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'unsupported' | 'failed';

export interface SharePayload {
  blob: Blob;
  filename: string;
  /** The message that travels with the image. */
  text: string;
  url: string;
}

export interface SharePort {
  readonly id: string;
  share(payload: SharePayload): Promise<ShareOutcome>;
}

/**
 * Browsers. `navigator.share` when it will take a file, a download otherwise.
 *
 * `canShare` is checked with the actual File rather than asked in the
 * abstract: Firefox and desktop Chrome both expose `navigator.share` and both
 * reject a files payload, so feature-detecting the function alone hands you a
 * rejected promise instead of a fallback.
 */
export class WebSharePort implements SharePort {
  readonly id = 'web';

  async share(payload: SharePayload): Promise<ShareOutcome> {
    const file = new File([payload.blob], payload.filename, { type: payload.blob.type });
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    const data: ShareData = { files: [file], text: payload.text, url: payload.url };

    if (nav.share && nav.canShare?.(data)) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (err) {
        // The user backing out of the system sheet rejects with AbortError.
        // That is not a failure and must not be reported as one.
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
        return 'failed';
      }
    }
    return this.download(payload);
  }

  private download(payload: SharePayload): ShareOutcome {
    try {
      const href = URL.createObjectURL(payload.blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = payload.filename;
      a.click();
      // Not revoked immediately: Safari has not finished reading the object
      // URL when `click()` returns, and revoking it there saves a download.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }
}

export class Sharing {
  private port: SharePort | null;
  private busy = false;

  constructor(port: SharePort | null = null) {
    this.port = port;
  }

  /** Swapped in `main.ts` on device — see `CapacitorSharePort`. */
  setPort(port: SharePort): void {
    this.port = port;
  }

  get portId(): string {
    return this.port?.id ?? 'none';
  }

  /**
   * One at a time. The system sheet is modal and a second call while it is up
   * either throws `InvalidStateError` or opens a second sheet behind the
   * first, depending on the platform.
   */
  async share(payload: SharePayload): Promise<ShareOutcome> {
    if (!this.port) return 'unsupported';
    if (this.busy) return 'cancelled';
    this.busy = true;
    try {
      const outcome = await this.port.share(payload);
      analytics.track('photo_shared', { outcome, port: this.port.id });
      return outcome;
    } catch {
      return 'failed';
    } finally {
      this.busy = false;
    }
  }
}

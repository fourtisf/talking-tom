/**
 * The share sheet on a packaged build.
 *
 * `navigator.share` is not available in an Android Capacitor WebView, so the
 * browser port silently falls through to a download there — and a "download"
 * inside a WebView writes a file the user cannot find. The native sheet has to
 * come from the plugin, and the plugin will not take a blob: it takes a file
 * URI, so the image is written to the cache directory first.
 *
 * CACHE, not documents. The photo has already been handed to whichever app the
 * user picked by the time the sheet closes; keeping a copy in the app's own
 * storage would leave an unbounded pile of PNGs nobody asked for. The OS
 * reclaims the cache on its own schedule, which is exactly the lifetime this
 * wants.
 *
 * Imported lazily by `main.ts` behind a native check, so a browser build never
 * pulls either plugin into the bundle.
 */

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import type { SharePayload, SharePort, ShareOutcome } from '@/services/Sharing';

/** Blob -> base64, which is the only shape Filesystem.writeFile accepts. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const url = String(reader.result);
      // A data URL, and writeFile wants the payload without the prefix.
      const comma = url.indexOf(',');
      resolve(comma >= 0 ? url.slice(comma + 1) : url);
    };
    reader.readAsDataURL(blob);
  });
}

export class CapacitorSharePort implements SharePort {
  readonly id = 'capacitor';

  async share(payload: SharePayload): Promise<ShareOutcome> {
    let uri: string;
    try {
      const written = await Filesystem.writeFile({
        path: payload.filename,
        data: await toBase64(payload.blob),
        directory: Directory.Cache,
      });
      uri = written.uri;
    } catch {
      return 'failed';
    }

    try {
      await Share.share({
        text: payload.text,
        url: uri,
        dialogTitle: payload.text,
      });
      return 'shared';
    } catch (err) {
      /*
       * The plugin rejects on dismissal as well as on error, with no code to
       * tell them apart on Android. Treated as a cancel: telling someone who
       * changed their mind that sharing FAILED sends them to look for a
       * problem that is not there, and the reverse mistake costs nothing —
       * they tap it again.
       */
      void err;
      return 'cancelled';
    }
  }
}

/**
 * Voice mimic — the genre's signature hook. Spec §9.
 *
 *  1. capture the mic for 2.5-3s;
 *  2. play it back at rate 1.6 with pitch preservation DISABLED, which is what
 *     produces the chipmunk voice;
 *  3. drive mouth-open amplitude from the playback signal — not a fake loop;
 *  4. pre-prompt before asking for permission, and stay fully playable when it
 *     is denied.
 *
 * Everything is wrapped: no browser or plugin failure may break the game.
 */

import { VOICE } from '@/config/tuning';
import { audio } from '@/core/Audio';
import { music } from '@/core/Music';
import { analytics } from '@/services/Analytics';
import { t } from '@/i18n';

/** Pull both audio sources down together, so the recording is never buried. */
function duck(ducked: boolean): void {
  audio.setDucked(ducked);
  music.setDucked(ducked);
}

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'playing';

export type VoiceFailure =
  | 'unsupported'
  | 'permission-denied'
  | 'no-audio'
  | 'playback-failed';

export type VoiceResult = { status: 'completed' } | { status: 'failed'; reason: VoiceFailure };

export interface VoiceCallbacks {
  onStateChange?: (state: VoiceState) => void;
  /** 0..1 amplitude, ~60fps while playing. Drives the mouth. */
  onAmplitude?: (amplitude: number) => void;
}

function isSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function'
  );
}

export class VoiceMimic {
  private state: VoiceState = 'idle';
  private callbacks: VoiceCallbacks = {};
  private rafId: number | null = null;
  private objectUrl: string | null = null;

  get currentState(): VoiceState {
    return this.state;
  }

  get isBusy(): boolean {
    return this.state !== 'idle';
  }

  /** Whether the hardware and APIs exist at all — drives the button's presence. */
  static get available(): boolean {
    return isSupported();
  }

  setCallbacks(callbacks: VoiceCallbacks): void {
    this.callbacks = callbacks;
  }

  private setState(state: VoiceState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  /**
   * Record, then play back. Resolves once playback finishes or something fails.
   * The caller decides what a failure looks like on screen; nothing here blocks.
   */
  async run(): Promise<VoiceResult> {
    if (this.isBusy) return { status: 'failed', reason: 'playback-failed' };
    if (!isSupported()) {
      analytics.track('voice_failed', { reason: 'unsupported' });
      return { status: 'failed', reason: 'unsupported' };
    }

    this.setState('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.setState('idle');
      analytics.track('voice_failed', { reason: 'permission-denied' });
      return { status: 'failed', reason: 'permission-denied' };
    }

    try {
      const blob = await this.record(stream);
      if (!blob || blob.size === 0) {
        analytics.track('voice_failed', { reason: 'no-audio' });
        return { status: 'failed', reason: 'no-audio' };
      }
      await this.playback(blob);
      analytics.track('voice_completed', {});
      return { status: 'completed' };
    } catch (err) {
      console.warn('[VoiceMimic] failed', err);
      analytics.track('voice_failed', { reason: 'playback-failed' });
      return { status: 'failed', reason: 'playback-failed' };
    } finally {
      for (const track of stream.getTracks()) track.stop();
      this.cleanup();
      this.setState('idle');
    }
  }

  private record(stream: MediaStream): Promise<Blob | null> {
    return new Promise((resolve) => {
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        resolve(null);
        return;
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        resolve(chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType }) : null);
      };
      recorder.onerror = () => resolve(null);

      this.setState('recording');
      recorder.start();

      const duration = Math.round(
        VOICE.recordMsMin + Math.random() * (VOICE.recordMsMax - VOICE.recordMsMin),
      );
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, duration);
    });
  }

  private playback(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      this.objectUrl = URL.createObjectURL(blob);
      const element = new Audio(this.objectUrl);
      element.playbackRate = VOICE.playbackRate;

      // Pitch preservation OFF is the whole effect. Vendor-prefixed on older
      // WebKit and Gecko builds, so all three are set.
      const pitched = element as HTMLAudioElement & {
        preservesPitch?: boolean;
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      pitched.preservesPitch = false;
      pitched.mozPreservesPitch = false;
      pitched.webkitPreservesPitch = false;

      // Duck the SFX bus and the music for the length of the playback (§11).
      duck(true);
      this.setState('playing');

      const analyser = this.attachAnalyser(element);

      element.onended = () => {
        duck(false);
        this.stopAmplitudeLoop();
        analyser?.disconnect();
        resolve();
      };
      element.onerror = () => {
        duck(false);
        this.stopAmplitudeLoop();
        analyser?.disconnect();
        reject(new Error('playback failed'));
      };

      void element.play().catch((err: unknown) => {
        duck(false);
        this.stopAmplitudeLoop();
        reject(err instanceof Error ? err : new Error('playback rejected'));
      });
    });
  }

  /**
   * Route the element through an analyser and report RMS amplitude each frame.
   * If Web Audio is unavailable the mouth simply stays shut — no fake loop.
   */
  private attachAnalyser(element: HTMLAudioElement): AnalyserNode | null {
    const ctx = audio.context;
    if (!ctx) return null;

    try {
      const source = ctx.createMediaElementSource(element);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = VOICE.analyserFftSize;
      analyser.smoothingTimeConstant = VOICE.analyserSmoothing;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const buffer = new Uint8Array(analyser.fftSize);
      const tick = (): void => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / buffer.length);
        // RMS of speech rarely exceeds ~0.3; scale so normal talking fills the
        // mouth without clipping every frame.
        const amplitude = Math.min(
          VOICE.mouthAmplitudeCeil,
          VOICE.mouthAmplitudeFloor + rms * 3.2,
        );
        this.callbacks.onAmplitude?.(amplitude);
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
      return analyser;
    } catch {
      return null;
    }
  }

  private stopAmplitudeLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.onAmplitude?.(0);
  }

  private cleanup(): void {
    this.stopAmplitudeLoop();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    duck(false);
  }
}

/** Player-facing copy. Never blocks the game; a denial is just a message. */
export function voiceFailureMessage(reason: VoiceFailure): string {
  switch (reason) {
    case 'unsupported':
      return "This device can't record, but everything else still works.";
    case 'permission-denied':
      return t('voice.error.permissionDenied');
    case 'no-audio':
      return "Didn't catch that — try again a little louder.";
    case 'playback-failed':
      return "Something went wrong playing that back.";
  }
}

/** Shown before the OS prompt so the ask has context (§9.4). */
export const MIC_PRE_PROMPT = {
  title: 'Let Biskit hear you',
  body: t('voice.prompt.body'),
  confirm: 'Allow microphone',
  decline: 'Not now',
} as const;

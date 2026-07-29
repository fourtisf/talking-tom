/**
 * SFX bus, ducking, mute. Spec §11.
 *
 * Sounds are synthesised with Web Audio oscillators — no asset files, so zero
 * download weight and zero licensing. The cue table is the prototype's, tuned
 * and kept. Replace with recorded samples only once a sound designer is
 * engaged; `play()` is the seam that would change.
 */

import { AUDIO } from '@/config/tuning';

export type SfxName =
  | 'tap'
  | 'coin'
  | 'eat'
  | 'pop'
  | 'level'
  | 'denied'
  | 'room'
  | 'bubble';

interface ToneSpec {
  freq: number;
  durationMs: number;
  type: OscillatorType;
  gain: number;
  delayMs?: number;
}

/** Spec §11's table, plus the two extra prototype cues. */
const CUES: Readonly<Record<SfxName, readonly ToneSpec[]>> = {
  tap: [
    { freq: 660, durationMs: 100, type: 'sine', gain: 0.06 },
    { freq: 990, durationMs: 80, type: 'sine', gain: 0.03, delayMs: 30 },
  ],
  coin: [
    { freq: 988, durationMs: 80, type: 'square', gain: 0.04 },
    { freq: 1319, durationMs: 120, type: 'square', gain: 0.04, delayMs: 70 },
  ],
  eat: [
    { freq: 240, durationMs: 90, type: 'triangle', gain: 0.09 },
    { freq: 180, durationMs: 100, type: 'triangle', gain: 0.07, delayMs: 100 },
  ],
  level: [
    { freq: 523, durationMs: 200, type: 'triangle', gain: 0.06 },
    { freq: 659, durationMs: 200, type: 'triangle', gain: 0.06, delayMs: 90 },
    { freq: 784, durationMs: 200, type: 'triangle', gain: 0.06, delayMs: 180 },
    { freq: 1047, durationMs: 200, type: 'triangle', gain: 0.06, delayMs: 270 },
  ],
  denied: [{ freq: 180, durationMs: 160, type: 'sawtooth', gain: 0.04 }],
  room: [
    { freq: 420, durationMs: 90, type: 'sine', gain: 0.035 },
    { freq: 560, durationMs: 90, type: 'sine', gain: 0.03, delayMs: 50 },
  ],
  pop: [{ freq: 1400, durationMs: 60, type: 'sine', gain: 0.035 }],
  bubble: [
    { freq: 900, durationMs: 70, type: 'sine', gain: 0.03 },
    { freq: 1250, durationMs: 60, type: 'sine', gain: 0.025, delayMs: 45 },
  ],
};

type AudioCtor = typeof AudioContext;

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private ducked = false;

  /** Lazily created: browsers refuse an AudioContext before a user gesture. */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor: AudioCtor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return null;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.targetGain();
      this.master.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      // No Web Audio (locked-down webview): the game stays fully playable.
      return null;
    }
  }

  /** Call from the first pointer event so iOS unlocks the context. */
  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  play(name: SfxName): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();

    for (const spec of CUES[name]) {
      this.emit(ctx, this.master, spec);
    }
  }

  /**
   * Play one arbitrary pitch.
   *
   * The named `CUES` record covers every sound tied to an action, but Copycat's
   * pads are pitches chosen at runtime — a triad plus the octave, so that a
   * wrong recall sounds wrong before the screen says so. Naming four more cues
   * would have been naming the notes of a scale, which is not what that record
   * is for.
   */
  tone(freq: number, seconds: number): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.emit(ctx, this.master, {
      type: 'sine',
      freq,
      gain: AUDIO.toneGain,
      durationMs: seconds * 1000,
    });
  }

  private emit(ctx: AudioContext, out: GainNode, spec: ToneSpec): void {
    try {
      const start = ctx.currentTime + (spec.delayMs ?? 0) / 1000;
      const seconds = spec.durationMs / 1000;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(spec.freq, start);

      // Exponential ramps cannot touch zero, hence the tiny floor.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, spec.gain), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // A failed cue must never break a game action.
    }
  }

  /** Duck SFX during voice-mimic playback (§11). */
  setDucked(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.rampMaster();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.rampMaster();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private targetGain(): number {
    if (this.muted) return 0;
    return this.ducked ? AUDIO.duckVolume : AUDIO.masterVolume;
  }

  private rampMaster(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.targetGain(), now + AUDIO.duckFadeMs / 1000);
  }

  /** Shared context for the voice-mimic analyser, so both live on one graph. */
  get context(): AudioContext | null {
    return this.ensureContext();
  }
}

export const audio = new AudioBus();

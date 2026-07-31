/**
 * SFX bus, ducking, mute. Spec §11.
 *
 * Sounds are synthesised with Web Audio oscillators — no asset files, so zero
 * download weight and zero licensing. The cue table is the prototype's, tuned
 * and kept. Replace with recorded samples only once a sound designer is
 * engaged; `play()` is the seam that would change.
 */

import { AUDIO } from '@/config/tuning';
import { CAT_VOICE, type VoiceCue, type VoiceName } from '@/core/catVoice';

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

  /**
   * One cat noise. See `catVoice` for why these are not the same as `play`.
   *
   * The graph is source -> N bandpass filters in parallel -> envelope -> out.
   * A beep is an oscillator straight into a gain; what makes this a voice is
   * that the oscillator is a buzz nobody hears directly and the filters are
   * the throat it comes out of.
   */
  voice(name: VoiceName): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.emitVoice(ctx, this.master, CAT_VOICE[name]);
  }

  private emitVoice(ctx: AudioContext, out: GainNode, cue: VoiceCue): void {
    try {
      const start = ctx.currentTime;
      const seconds = cue.durationMs / 1000;

      /*
       * Two kinds of source, and the difference is the difference between a
       * voice and a hiss. An oscillator has a pitch; turbulence does not.
       */
      let source: AudioScheduledSourceNode;
      if (cue.noise) {
        const frames = Math.ceil((seconds + 0.05) * ctx.sampleRate);
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        source = noise;
      } else {
        const osc = ctx.createOscillator();
        osc.type = cue.type;
        /*
         * The pitch GLIDE, not a pitch. Scheduled as ramps between the points,
         * because a cat noise that holds one frequency is a doorbell — this is
         * the single line that separates a meow from a beep.
         */
        const [firstAt, firstHz] = cue.pitch[0] ?? [0, 440];
        osc.frequency.setValueAtTime(firstHz, start + firstAt * seconds);
        for (const [at, hz] of cue.pitch.slice(1)) {
          osc.frequency.linearRampToValueAtTime(hz, start + at * seconds);
        }
        source = osc;
      }

      const env = ctx.createGain();
      const [ampAt, ampV] = cue.amp[0] ?? [0, 0];
      env.gain.setValueAtTime(ampV * cue.peak, start + ampAt * seconds);
      for (const [at, v] of cue.amp.slice(1)) {
        env.gain.linearRampToValueAtTime(v * cue.peak, start + at * seconds);
      }

      const nodes: AudioNode[] = [source, env];
      for (const formant of cue.formants) {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.setValueAtTime(formant.hz, start);
        band.Q.setValueAtTime(formant.q, start);
        const level = ctx.createGain();
        level.gain.setValueAtTime(formant.gain, start);
        source.connect(band);
        band.connect(level);
        level.connect(env);
        nodes.push(band, level);
      }
      env.connect(out);

      /*
       * The purr's flutter, as an LFO ADDED to the envelope's own gain.
       *
       * Web Audio sums a connected signal onto a scheduled AudioParam rather
       * than replacing it, so the envelope and the wobble coexist without
       * either having to know about the other. Depth stays under the peak so
       * the sum does not swing through zero and phase-invert on every cycle.
       */
      if (cue.wobbleHz && cue.wobbleDepth) {
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(cue.wobbleHz, start);
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(cue.wobbleDepth * cue.peak * 0.5, start);
        lfo.connect(depth);
        depth.connect(env.gain);
        lfo.start(start);
        lfo.stop(start + seconds + 0.02);
        nodes.push(lfo, depth);
      }

      source.start(start);
      source.stop(start + seconds + 0.02);
      source.onended = () => {
        for (const node of nodes) node.disconnect();
      };
    } catch {
      // A failed cue must never break a game action.
    }
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

/**
 * Background music, synthesised.
 *
 * Same reasoning as the SFX in §11: oscillators mean no asset files, no
 * download weight and no licensing. A four-bar loop in C major pentatonic —
 * every note in the scale sits happily against every chord, so the loop can
 * repeat for an hour without ever landing on a sour interval.
 *
 * Scheduling uses the standard Web Audio lookahead: a coarse timer wakes up
 * often and queues notes slightly ahead of the clock. Scheduling notes directly
 * from `setInterval` would audibly wobble, because timers are not sample-accurate.
 */

import { MUSIC } from '@/config/tuning';
import { audio, type AudioBus } from '@/core/Audio';

/** C major pentatonic. `0` is a rest. */
const E4 = 329.63;
const G4 = 392.0;
const A4 = 440.0;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880.0;

/** Four bars of eight, descending gently and turning back on itself. */
const MELODY: readonly number[] = [
  E5, G5, A5, G5, E5, D5, E5, 0,
  D5, E5, G5, E5, D5, C5, D5, 0,
  C5, D5, E5, D5, C5, A4, C5, 0,
  G4, A4, C5, A4, G4, E4, G4, 0,
];

/** One root per bar: I - vi - IV - V, the warmest progression there is. */
const BASS: readonly number[] = [130.81, 110.0, 87.31, 98.0];

const STEPS_PER_BAR = 8;

export class MusicPlayer {
  private readonly bus: AudioBus;

  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextStepAt = 0;

  private playing = false;
  private muted = false;
  private ducked = false;

  constructor(bus: AudioBus) {
    this.bus = bus;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Begin, or resume after a mute. Safe to call repeatedly — and it must be
   * called from a user gesture the first time, or the browser refuses to start
   * the audio context at all.
   */
  start(): void {
    if (this.playing || this.muted) return;
    const ctx = this.bus.context;
    if (!ctx) return;

    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = this.targetGain();
      this.gain.connect(ctx.destination);
    }

    this.playing = true;
    this.step = 0;
    this.nextStepAt = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.pump(), MUSIC.schedulerIntervalMs);
    this.rampGain();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) {
      this.rampGain();
      // Let the tail ring out rather than cutting mid-note.
      setTimeout(() => {
        if (this.muted) this.stop();
      }, MUSIC.fadeMs + 60);
    } else {
      this.start();
    }
  }

  /** Pulled down while the voice-mimic playback runs (§11). */
  setDucked(ducked: boolean): void {
    if (this.ducked === ducked) return;
    this.ducked = ducked;
    this.rampGain();
  }

  private targetGain(): number {
    if (this.muted) return 0;
    return this.ducked ? MUSIC.duckVolume : MUSIC.volume;
  }

  private rampGain(): void {
    const ctx = this.bus.context;
    if (!ctx || !this.gain) return;
    const now = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(this.targetGain(), now + MUSIC.fadeMs / 1000);
  }

  /** Queue every step that falls inside the lookahead window. */
  private pump(): void {
    const ctx = this.bus.context;
    if (!ctx || !this.gain || !this.playing) return;

    const stepSeconds = 60 / MUSIC.bpm / 2; // eighth notes
    const horizon = ctx.currentTime + MUSIC.lookaheadMs / 1000;

    while (this.nextStepAt < horizon) {
      this.scheduleStep(ctx, this.step, this.nextStepAt, stepSeconds);
      this.nextStepAt += stepSeconds;
      this.step = (this.step + 1) % MELODY.length;
    }
  }

  private scheduleStep(ctx: AudioContext, step: number, at: number, stepSeconds: number): void {
    const note = MELODY[step] ?? 0;
    if (note > 0) {
      this.voice(ctx, note, at, stepSeconds * 1.7, 'triangle', 0.5);
      // A fifth above, very quiet — gives the line some air without a second
      // melody to keep track of.
      this.voice(ctx, note * 1.5, at, stepSeconds * 1.2, 'sine', 0.14);
    }

    // Bass lands on the downbeat of each bar and holds underneath.
    if (step % STEPS_PER_BAR === 0) {
      const bar = Math.floor(step / STEPS_PER_BAR) % BASS.length;
      const root = BASS[bar];
      if (root !== undefined) {
        this.voice(ctx, root, at, stepSeconds * STEPS_PER_BAR * 0.95, 'sine', 0.62);
      }
    }
  }

  private voice(
    ctx: AudioContext,
    freq: number,
    at: number,
    seconds: number,
    type: OscillatorType,
    level: number,
  ): void {
    if (!this.gain) return;
    try {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, at);

      // Soft attack and a long decay: a plucked envelope would read as a game
      // sound effect rather than as music.
      env.gain.setValueAtTime(0.0001, at);
      env.gain.linearRampToValueAtTime(level, at + Math.min(0.09, seconds * 0.25));
      env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

      osc.connect(env);
      env.connect(this.gain);
      osc.start(at);
      osc.stop(at + seconds + 0.02);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    } catch {
      // A dropped note must never take the game with it.
    }
  }

  destroy(): void {
    this.stop();
    this.gain?.disconnect();
    this.gain = null;
  }
}

/**
 * Shares the SFX bus's AudioContext — one graph, one hardware clock. Music has
 * its own gain node and its own mute, though: wanting the tap and coin cues
 * without a loop running for an hour is an entirely normal preference.
 */
export const music = new MusicPlayer(audio);

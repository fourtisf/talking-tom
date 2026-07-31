/**
 * The noises a cat makes, described rather than recorded.
 *
 * WHY SYNTHESISED. Every other sound in the game is an oscillator for the
 * reason in `Audio`: no asset files, nothing to download, nothing to license.
 * Four sampled cat noises would be the first megabyte in a bundle that has
 * none — and a real recording cannot be pitched to her mood, stretched for a
 * long purr, or made to trail off when she is interrupted. These can.
 *
 * WHY A CAT DOES NOT SOUND LIKE A BEEP. A beep is one frequency. A voice is a
 * buzzing source filtered by a throat, and the throat's resonances — formants —
 * are what the ear identifies. So each cue below is a pitch GLIDE through two
 * bandpass filters, which is the smallest thing that reads as an animal rather
 * than as a notification.
 *
 * The numbers are the real ranges, not invented ones. A domestic cat's meow
 * runs roughly 300-800 Hz at the fundamental with formants near 900 and 2100;
 * a purr is an amplitude flutter at 20-30 Hz over a very low rumble, and it is
 * the flutter rate, not the pitch, that makes it recognisable.
 *
 * Phaser-free and Web-Audio-free ON PURPOSE. These are data, so the shape of a
 * meow — up then down, never flat — is checkable in a test, and `Audio` is the
 * only file that has to know what a BiquadFilter is.
 */

/** A point on an envelope: [fraction of the cue's length, value]. */
export type Point = readonly [number, number];

export interface Formant {
  /** Centre of the resonance, Hz. */
  hz: number;
  /** How narrow. Higher is more vowel-like and more nasal. */
  q: number;
  /** Relative loudness of this resonance against the others. */
  gain: number;
}

export interface VoiceCue {
  /** Fundamental over time. The GLIDE is the whole trick — see the note above. */
  pitch: readonly Point[];
  /** Loudness over time, 0..1, scaled by `peak`. */
  amp: readonly Point[];
  formants: readonly Formant[];
  durationMs: number;
  /** Sawtooth: a formant filter needs harmonics to carve, and a sine has none. */
  type: OscillatorType;
  peak: number;
  /** Amplitude flutter, Hz. Only the purr has one. */
  wobbleHz?: number;
  /** How deep that flutter cuts, 0..1 of `peak`. */
  wobbleDepth?: number;
  /**
   * Source is white noise rather than an oscillator.
   *
   * Only the hiss. A hiss has NO fundamental — it is turbulence — and the first
   * version used a sawtooth like the others, which measured out at a rock-solid
   * 1764 Hz falling to 1575. That is a kettle, not a cat. Noise through the
   * same two formant filters is the actual sound.
   */
  noise?: boolean;
}

export type VoiceName = 'meow' | 'purr' | 'chirp' | 'hiss' | 'yawn';

export const CAT_VOICE: Readonly<Record<VoiceName, VoiceCue>> = {
  /**
   * The plain meow. Up fast, hold, down slow — an "eee-ow".
   *
   * The rise has to be quicker than the fall or it reads as a question every
   * time, and a cat that sounds quizzical whenever you feed her is a cat with
   * one emotion.
   */
  meow: {
    pitch: [
      [0, 420],
      [0.14, 760],
      [0.42, 700],
      [1, 360],
    ],
    amp: [
      [0, 0],
      [0.07, 1],
      [0.62, 0.8],
      [1, 0],
    ],
    formants: [
      { hz: 900, q: 6, gain: 1 },
      { hz: 2100, q: 9, gain: 0.55 },
    ],
    durationMs: 520,
    type: 'sawtooth',
    peak: 0.075,
  },

  /**
   * The purr: a 26 Hz flutter over a 55 Hz rumble.
   *
   * The rumble is nearly inaudible on a phone speaker and that is fine — the
   * flutter is the signal. Long, because a purr that stops after 300ms is a
   * growl, and it fades in rather than starting: a purr you can hear beginning
   * sounds like a machine switching on.
   */
  purr: {
    pitch: [
      [0, 56],
      [1, 50],
    ],
    amp: [
      [0, 0],
      [0.18, 1],
      [0.8, 0.95],
      [1, 0],
    ],
    formants: [
      { hz: 220, q: 3.5, gain: 1 },
      { hz: 620, q: 5, gain: 0.35 },
    ],
    durationMs: 1500,
    type: 'sawtooth',
    peak: 0.09,
    wobbleHz: 26,
    wobbleDepth: 0.8,
  },

  /**
   * The chirrup cats greet with — the short rising trill, not a meow. Used
   * when she has something to say, so her speech bubble has a voice.
   */
  chirp: {
    pitch: [
      [0, 620],
      [0.45, 1180],
      [1, 940],
    ],
    amp: [
      [0, 0],
      [0.12, 1],
      [1, 0],
    ],
    formants: [
      { hz: 1500, q: 8, gain: 1 },
      { hz: 2800, q: 10, gain: 0.4 },
    ],
    durationMs: 210,
    type: 'sawtooth',
    peak: 0.05,
  },

  /**
   * Cross. Genuinely noise: see `noise` on `VoiceCue` for what the first
   * attempt sounded like. `pitch` is ignored for a noise source and kept only
   * so the shape of the type stays the same for every cue.
   */
  hiss: {
    noise: true,
    pitch: [
      [0, 1800],
      [1, 1500],
    ],
    amp: [
      [0, 0],
      [0.05, 1],
      [0.55, 0.7],
      [1, 0],
    ],
    formants: [
      { hz: 3400, q: 2, gain: 1 },
      { hz: 5200, q: 2, gain: 0.7 },
    ],
    durationMs: 420,
    type: 'sawtooth',
    peak: 0.055,
  },

  /** Waking up: long, falling, and slack. The opposite shape to the meow. */
  yawn: {
    pitch: [
      [0, 520],
      [0.35, 430],
      [1, 250],
    ],
    amp: [
      [0, 0],
      [0.25, 1],
      [0.7, 0.75],
      [1, 0],
    ],
    formants: [
      { hz: 700, q: 4, gain: 1 },
      { hz: 1500, q: 6, gain: 0.45 },
    ],
    durationMs: 900,
    type: 'sawtooth',
    peak: 0.065,
  },
};

/** Value of an envelope at `t` (0..1), linearly between its points. */
export function envelopeAt(points: readonly Point[], t: number): number {
  const first = points[0];
  if (!first) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    if (t > b[0]) continue;
    const span = b[0] - a[0];
    if (span <= 0) return b[1];
    return a[1] + ((t - a[0]) / span) * (b[1] - a[1]);
  }
  return (points[points.length - 1] as Point)[1];
}

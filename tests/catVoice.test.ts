/**
 * The shape of each cat noise.
 *
 * The sound itself cannot be judged here — that took rendering the real
 * `AudioBus` into an OfflineAudioContext and measuring the PCM, which is how
 * the hiss was caught: it was a sawtooth like the others and measured out at a
 * rock-solid 1764 Hz falling to 1575, which is a kettle. What CAN be checked
 * here is the description, and the description is where every one of these
 * goes wrong: a flat pitch is a beep, an envelope that does not reach zero
 * clicks, and a purr flutter outside 20-30 Hz is not a purr at any volume.
 */

import { describe, expect, it } from 'vitest';

import { CAT_VOICE, envelopeAt, type VoiceCue, type VoiceName } from '@/core/catVoice';

const NAMES = Object.keys(CAT_VOICE) as VoiceName[];
const peakHz = (cue: VoiceCue) => Math.max(...cue.pitch.map(([, hz]) => hz));

describe('every cue is well formed', () => {
  it.each(NAMES)('%s runs its envelopes from 0 to 1 in order', (name) => {
    const cue = CAT_VOICE[name];
    for (const points of [cue.pitch, cue.amp]) {
      expect(points.length).toBeGreaterThan(1);
      expect(points[0]![0]).toBe(0);
      expect(points[points.length - 1]![0]).toBe(1);
      for (let i = 1; i < points.length; i++) {
        expect(points[i]![0]).toBeGreaterThan(points[i - 1]![0]);
      }
    }
  });

  it.each(NAMES)('%s opens and closes on silence', (name) => {
    // A cue that starts at full amplitude clicks, and a click is the most
    // noticeable artefact there is — more than being out of tune.
    const { amp } = CAT_VOICE[name];
    expect(amp[0]![1]).toBe(0);
    expect(amp[amp.length - 1]![1]).toBe(0);
  });

  it.each(NAMES)('%s stays quiet enough to sit under the SFX (%s)', (name) => {
    // The loudest existing cue is 0.09. A voice that dwarfs the coin sound
    // makes every other sound in the game feel like a mistake.
    expect(CAT_VOICE[name].peak).toBeGreaterThan(0);
    expect(CAT_VOICE[name].peak).toBeLessThanOrEqual(0.09);
  });

  it.each(NAMES)('%s has formants, which is what stops it being a beep', (name) => {
    const cue = CAT_VOICE[name];
    expect(cue.formants.length).toBeGreaterThanOrEqual(1);
    for (const f of cue.formants) {
      expect(f.hz).toBeGreaterThan(0);
      expect(f.q).toBeGreaterThan(0);
      // A bandpass above Nyquist at 44.1k passes nothing at all: silence that
      // looks like a working cue in the source.
      expect(f.hz).toBeLessThan(20_000);
    }
  });
});

describe('each one is the noise it claims to be', () => {
  /**
   * Up then down. A meow that only rises is a question, and a cat that sounds
   * quizzical every time you feed her has one emotion.
   */
  it('meows with a rise and a longer fall', () => {
    const cue = CAT_VOICE.meow;
    const start = cue.pitch[0]![1];
    const top = peakHz(cue);
    const end = cue.pitch[cue.pitch.length - 1]![1];
    expect(top).toBeGreaterThan(start * 1.4);
    expect(end).toBeLessThan(start);
    // The peak arrives early, so the fall is the long part.
    const topAt = cue.pitch.find(([, hz]) => hz === top)![0];
    expect(topAt).toBeLessThan(0.35);
  });

  it('yawns downward the whole way', () => {
    // The opposite shape to the meow, and the reason there are two cues at all
    // rather than one played at different speeds.
    const { pitch } = CAT_VOICE.yawn;
    for (let i = 1; i < pitch.length; i++) {
      expect(pitch[i]![1]).toBeLessThan(pitch[i - 1]![1]);
    }
    expect(CAT_VOICE.yawn.durationMs).toBeGreaterThan(CAT_VOICE.meow.durationMs);
  });

  it('purrs at the rate a purr actually flutters', () => {
    // 20-30 Hz is the measured range for a domestic cat. Outside it the ear
    // hears either a tremolo effect or a rattle, never a purr — and the
    // rendered audio comes back at 26.4 Hz against the 26 asked for here.
    const cue = CAT_VOICE.purr;
    expect(cue.wobbleHz).toBeGreaterThanOrEqual(20);
    expect(cue.wobbleHz).toBeLessThanOrEqual(30);
    expect(cue.wobbleDepth).toBeGreaterThan(0.3);
    // Under 1 so the modulation cannot swing the envelope through zero and
    // phase-invert on every cycle.
    expect(cue.wobbleDepth).toBeLessThan(1);
    // A purr is felt more than heard: the fundamental is very low.
    expect(peakHz(cue)).toBeLessThan(120);
    // And it lasts. Under about a second it reads as a growl.
    expect(cue.durationMs).toBeGreaterThan(1000);
  });

  it('hisses with noise rather than a pitch', () => {
    // THE ONE THE RENDER CAUGHT. A hiss is turbulence and has no fundamental;
    // as a sawtooth it came out as a clean falling whistle.
    expect(CAT_VOICE.hiss.noise).toBe(true);
    expect(CAT_VOICE.hiss.formants.every((f) => f.hz > 2500)).toBe(true);
  });

  it('chirps short and high, so it does not read as a meow', () => {
    const cue = CAT_VOICE.chirp;
    expect(cue.durationMs).toBeLessThan(CAT_VOICE.meow.durationMs / 2);
    expect(cue.pitch[0]![1]).toBeGreaterThan(CAT_VOICE.meow.pitch[0]![1]);
  });

  it('gives only the purr a flutter', () => {
    for (const name of NAMES.filter((n) => n !== 'purr')) {
      expect(CAT_VOICE[name].wobbleHz).toBeUndefined();
    }
  });
});

describe('envelopeAt', () => {
  const points = [
    [0, 0],
    [0.5, 10],
    [1, 2],
  ] as const;

  it('hits the points it is given', () => {
    expect(envelopeAt(points, 0)).toBe(0);
    expect(envelopeAt(points, 0.5)).toBe(10);
    expect(envelopeAt(points, 1)).toBe(2);
  });

  it('interpolates between them', () => {
    expect(envelopeAt(points, 0.25)).toBeCloseTo(5, 6);
    expect(envelopeAt(points, 0.75)).toBeCloseTo(6, 6);
  });

  it('clamps rather than extrapolating off either end', () => {
    // Rounding can hand it a t a hair outside the range; returning a wild
    // number there would be an audible spike on the first or last frame.
    expect(envelopeAt(points, -1)).toBe(0);
    expect(envelopeAt(points, 2)).toBe(2);
  });

  it('survives an empty envelope instead of throwing', () => {
    expect(envelopeAt([], 0.5)).toBe(0);
  });
});

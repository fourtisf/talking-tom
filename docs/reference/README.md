# Design reference

`biskit-prototype.html` is the single-file design and systems reference the game
was built from. It is **not** production code and nothing in it is imported,
bundled or shipped — it lives here so that layout, colour tokens, animation
timing and interaction feel can be checked against the original intent.

Open it directly in a browser.

## Read it for

- colour tokens (its `:root` block is the source of `src/config/palette.ts`)
- animation timings (breathe 3.6s, squash 440ms, hop 620ms, and the rest)
- the SFX cue table (frequencies, waveforms and durations, kept verbatim)
- layout proportions for the dock, meters, tray and nav

## Do not read it for

**Tuning.** Its stat decay runs on a 1.4-second tick so the loop is visible in a
60-second demo. Production values live in `src/config/tuning.ts` and are per
hour — roughly 2000x slower. Copying a number out of this file into the game is
always a bug.

## Not included here

The original build prompt is deliberately absent. It names competitor brands in
the clause that forbids using them, and the acceptance criteria require zero
brand references anywhere in the repo — a rule `tests/repoHygiene.test.ts`
enforces by scanning every file. Keep the prompt outside the repository.

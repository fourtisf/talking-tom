# Brand assets

Every asset here is generated from the game's own vector cat and palette, so
the brand and the product cannot drift apart.

| File | Size | Use |
|---|---|---|
| `logo-mark.png` | 1024×1024 | App icon, store listing, anywhere a square mark is wanted |
| `logo-lockup.png` | 1200×340 | Mark + wordmark, **dark type** — for light backgrounds |
| `logo-lockup-dark.png` | 1200×340 | Mark + wordmark, **light type** — for dark backgrounds |
| `x-avatar.png` | 400×400 | X / Twitter profile picture |
| `x-banner.png` | 1500×500 | X / Twitter header |

```bash
node brand/build.mjs     # SVG sources  <- edit build.mjs, never the SVGs
node brand/render.mjs    # PNGs         <- never edit these
```

The `.svg` files are **generated too**. `build.mjs` is the only thing to edit;
everything else is output.

## The cat is not redrawn here

`_parts_head.svg` and `_parts_full.svg` are lifted verbatim from the hero SVG in
`index.html`, which is itself kept in step with `src/pet/PetArt.ts`. Change the
cat in the game, re-extract, rebuild. Never touch the copies by hand — a brand
kit that has quietly diverged from the product is worse than none.

## Framing is derived, not eyeballed

The head measures **188 × 209.8** around **(150, 135.1)**, and its **ear tips**
are the corners a round crop cuts first, at **140.9** units from centre. Every
circular or squircular frame is scaled from that number rather than from the
bounding box — a first attempt that framed by bbox sheared the ears clean off.

## Safe zones on the banner

Two things eat into an X header, and both are unforgiving:

1. **The profile picture** overlaps the bottom-left — roughly x 90…330,
   y 330…500.
2. **A narrow window** keeps only about the middle 60%, x 300…1200.

The wordmark, tagline, call to action and the whole cat sit inside that band.
These were **checked by compositing** the avatar and the crop over the banner,
not assumed — which is how three faults turned up that were invisible in the
flat PNG: a shelf prop sitting directly behind the call to action, the cat's
tail crossing the crop line, and the tagline's last word running into her ear.

## Why it reads as a brand asset and not clip art

Flat vector on a flat gradient was the first pass, and it read as clip art. What
changed: one light source you can point at (top-left, carried by a key highlight
and a matching light shaft in the banner), a contact shadow under every subject
so it sits *in* the scene rather than on it, a cast shadow on the cat herself,
falloff at the frame edges, and a few sparkles borrowed from the game's own star
icon. None of it is decoration for its own sake — it is what gives a flat
drawing somewhere to stand.

Two polarities of the lockup exist for the same reason: a single
white-on-transparent version disappears the moment anyone drops it on a light
page, which is most pages.

## Typeface

`fredoka.woff2` is the Latin subset of **Fredoka**, the typeface the game's
design calls for. `render.mjs` inlines it as base64, so output depends on
neither the network nor a system font. Left to a font stack the wordmark
silently bakes in whatever generic sans the machine happens to have — which is
the difference between a brand asset and a screenshot of one.

Licensed under the **SIL Open Font License 1.1** — see `OFL-Fredoka.txt`.
Redistribution is permitted and the licence travels with the file.

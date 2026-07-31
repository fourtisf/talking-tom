# Brand assets

Every asset here is generated from the game's own vector cat and palette, so
the brand and the product cannot drift apart.

Every PNG is rendered at 2x and downsampled to the size below. That is what
the code always claimed to do and, until it was measured against X's upload
limit, only half did — `x-banner.png` was shipping at 3000x1000 and 2.85MB
against a 2MB header cap, so the banner in this kit could not actually be
uploaded to the profile it was made for. Check the sizes after any render.

| File | Size | Bytes | Use |
|---|---|---|
| `logo-mark.png` | 1024×1024 | 825 KB | App icon, store listing, anywhere a square mark is wanted |
| `logo-lockup.png` | 1200×340 | 131 KB | Mark + wordmark, **dark type** — for light backgrounds |
| `logo-lockup-dark.png` | 1200×340 | 130 KB | Mark + wordmark, **light type** — for dark backgrounds |
| `x-avatar.png` | 400×400 | 165 KB | X / Twitter profile picture (limit 2 MB) |
| `x-banner.png` | 1500×500 | 954 KB | X / Twitter header (limit 2 MB) |

```bash
node brand/build.mjs     # SVG sources  <- edit build.mjs, never the SVGs
node brand/render.mjs    # PNGs         <- never edit these
```

The `.svg` files are **generated too**. `build.mjs` is the only thing to edit;
everything else is output.

## Marketing banners

Five 1600×900 banners in `banners/` — introduction, rooms, dress-up, voice and
the gem rack. Words for all of them, plus store listings and social copy, live
in `docs/copy-deck.md`.

```bash
npm run dev -- --port 8105   # in another shell — shots.mjs drives the real game
node brand/shots.mjs         # brand/shots.json   <- gitignored, ~5 MB
node brand/banners.mjs       # brand/banners/*.png
```

**No pet art is drawn here either.** `shots.mjs` opens the game with a seeded
save, taps the in-game camera and intercepts the 840-wide photo card, so every
picture on a banner is a frame the player can actually produce. That is partly
the spec (§2.1 forbids generating character art) and partly self-defence: a
banner showing art the game does not have is a banner that lies.

Two things that are load-bearing and easy to undo by accident:

* **The font is inlined**, like `render.mjs`. It was briefly loaded over HTTP
  from the dev server and silently failed — `setContent` leaves the document on
  `about:blank`, so a cross-origin font fetch is blocked and the headlines
  quietly set themselves in the fallback sans. They looked fine. They were not
  the brand.
* **Prices on the premium banner come from `tuning.ts`** and every item on it is
  gem-priced. An earlier cut had the crown on that banner; the crown costs 600
  coins, which makes "not for sale" false.

## The cat is not redrawn here

`_parts_head.svg` and `_parts_full.svg` are lifted verbatim from the hero SVG in
`index.html`, which is itself kept in step with `src/pet/PetArt.ts`. Change the
cat in the game, re-extract, rebuild. Never touch the copies by hand — a brand
kit that has quietly diverged from the product is worse than none.

## Everything square is a FULL square

`logo-mark.png` and `x-avatar.png` are full, opaque squares with no rounded
corners and no alpha. That is deliberate, and it is not a style choice:

* **X** applies the circular mask itself. Upload a pre-cropped disc and the
  corners it was clipped out of are not transparent by the time they are a PNG
  — they composite to **white**, so the profile shows a purple circle sitting on
  a white square. That is exactly what the first version did.
* **iOS and Google Play both reject** an icon that arrives with alpha or
  pre-rounded corners, and apply their own mask.

  Precisely: every pixel in `logo-mark.png` and `x-avatar.png` is **fully
  opaque** — verified, alpha minimum 255 — but the PNG still carries an alpha
  *channel*, because that is the only thing a canvas encoder emits. X and Play
  are fine with that. Apple's validator can object to the channel itself, so an
  App Store submission may need one flattening pass to RGB first
  (`sips -s format png --setProperty hasAlpha false`, or any encoder that will
  write colour type 2). Nothing in this repo does that, deliberately: it would
  mean a native dependency for a step that runs once per store submission.

The subject is still sized against the **circle**, since that is the tightest
mask any consumer applies.

## Framing is derived, not eyeballed

The head measures **188 × 209.8** around **(150, 135.1)**, and its **ear tips**
are the corners a round crop cuts first, at **140.9** units from centre. Every
circular or squircular frame is scaled from that number rather than from the
bounding box — a first attempt that framed by bbox sheared the ears clean off.

`scratchpad`-style previews render the avatar at 240, 96 and 48px inside a
circle, on light and dark, because 48px in a timeline is where a mark either
survives or does not.

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

## The cat's lashes are filled outlines, not strokes

SVG cannot taper a stroke. `PetArt.lashes()` tapers hers from **5.6 to 2.2**, and
the copies here used to approximate that with a flat `stroke-width="5.4"` — which
kept the tips as heavy as the roots. Two long, even-weight dark lines sitting off
each eye are *whiskers*, which is the one thing `PetArt.ts` explicitly refuses to
draw, and it is what the banner shipped before anyone looked at it at full size.

They are now generated from the same quadratic curves the game uses and emitted
as filled outlines, with head-local `(0,0)` placed at **(149, 138)** — derived
from the eye rather than eyeballed, since PetArt draws it at `(-49, 22)` and
these files at `(100, 160)`. This is the drift the "never redraw the cat here"
rule exists to prevent, and it happened anyway, so: after any change to
`PetArt.ts`, look at `x-banner.png` at full size, not just the thumbnail.

## The banner's ground is deep on purpose

The pass before this one was pale lavender with white type on it, and the
wordmark — the largest object on the canvas — was the hardest thing on it to
read. A white cat and white type both need something dark to sit against. The
ground is now the game's own `--ink` under a grape wash, which is where the
white subject and the mint call to action both get their contrast from.

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

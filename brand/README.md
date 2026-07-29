# Brand assets

Social artwork for Biskit, built from the game's own vector cat and palette so
the two cannot drift apart.

| File | Size | Use |
|---|---|---|
| `x-avatar.png` | 400×400 | X / Twitter profile picture |
| `x-banner.png` | 1500×500 | X / Twitter header |

Sources are the `.svg` files beside them. **Edit the SVG, never the PNG**, then:

```bash
node brand/render.mjs
```

## How the art stays in sync with the game

The cat is not redrawn here. `_cat.svg` is lifted verbatim from the hero SVG in
`index.html`, which is itself kept in step with `src/pet/PetArt.ts`. Change the
cat in the game and re-extract; do not touch the copy by hand.

## Why the framing is what it is

**Avatar.** X crops it to a circle and renders it as small as 48px in a
timeline. So: the head only — the body and tail become unreadable blobs under a
circular crop — and no text, because a wordmark at 48px is a smudge. The scale
is derived rather than eyeballed: the head measures 188×209.8 around
(150, 135.1), and its *ear tips* are the corners a circular crop cuts first, at
140.9 units from centre. Scaling to put them 180 out of a 200 radius clears the
crop with room to spare.

**Banner.** Two things eat into it, and both are unforgiving:

1. The profile picture overlaps the bottom-left — roughly x 90…330, y 330…500.
   Nothing goes there.
2. A narrow window keeps roughly the middle 60% (x 300…1200). The wordmark, the
   tagline, the call to action and the whole cat all sit inside that band.

`scratchpad/xpreview.mjs`-style compositing is how those were checked rather
than assumed: an earlier draft had the shelf prop sitting directly behind the
call to action, and the cat's tail crossing the crop line. Both were invisible
in the flat PNG and obvious the moment the avatar and crop were overlaid.

## Typeface

`fredoka.woff2` is the Latin subset of **Fredoka**, the typeface the game's
design calls for. It is inlined as base64 at render time, so the output depends
on neither the network nor a system font — left to a font stack the wordmark
silently bakes in whatever generic sans is installed, which is the difference
between a brand asset and a screenshot of one.

Licensed under the **SIL Open Font License 1.1** — see `OFL-Fredoka.txt`.
Redistribution is permitted and the licence travels with the file.

# Character art specification

For the commissioned illustrator. This describes exactly what the game needs
back so the delivered art drops in without any rig work.

The cat currently in the build is a **placeholder**, drawn as vector primitives.
It exists to prove the rig and to be thrown away. Match its proportions only
where you want to; match its **part list and anchors** exactly, because those
are what the code addresses.

---

## The short version

Deliver a texture atlas of **20 separate parts plus 4 mouth shapes**, each drawn
around its own pivot, on a 300 × 360 canvas. Nothing may be baked together —
the head must not include the ears, the eye must not include the pupil.

---

## Why it is split up

The pet is a hierarchy of independently transformable parts, not a spritesheet
of finished frames:

```
root
├── tail                     swings from the hip
├── legL, legR
├── body                     breathes (scaleY), bobs while eating
├── armL, armR
└── head                     the whole head moves as one
    ├── earL, earR           rotate independently, staggered
    ├── eyeWhiteL/R          static socket
    ├── eyeBallL/R           iris + pupil group, translates ±7px to look around
    ├── lidL/R               scales 0→1 to blink and to sleep
    ├── lashes
    ├── muzzle, nose
    ├── blush                fades up when happy
    ├── mouth                one of four shapes, swapped
    └── accessory            hats anchor here
```

Every animation in §10 — breathe, blink, squash, hop, eat, talk, sleep, gaze,
stretch, yawn, tail wag, ear perk — is produced by transforming these parts at
runtime. **No animation frames are needed.** If a part arrives fused to another,
the animation that moves it independently is simply lost.

---

## The part list

Names must match exactly (they are `PartKey` in `src/pet/PetArt.ts`). The design
space is 300 × 360 with the origin at top-left; "pivot" is where the part's own
origin sits, in that space.

| Part | Pivot (x, y) | Notes |
|---|---|---|
| `tail` | 236, 240 | Drawn as if hanging from the hip at (206, 306); it rotates about its base |
| `body` | 150, 278 | Includes the belly patch. Breathes and bobs, so nothing else may be attached |
| `armL` | 88, 288 | |
| `armR` | 212, 288 | Mirror of armL is fine |
| `legL` | 116, 324 | |
| `legR` | 184, 324 | |
| `head` | 150, 140 | Face base only — **no ears, no eyes, no mouth** |
| `earL` | 100, 70 | Pivot at the base, not the tip: it rotates about where it meets the head |
| `earR` | 200, 70 | |
| `eyeWhiteL` | 100, 158 | The socket the ball moves inside |
| `eyeWhiteR` | 200, 158 | |
| `eyeBallL` | 101, 162 | Iris, pupil and highlights as one group. Must stay inside the white at ±7px |
| `eyeBallR` | 199, 162 | |
| `lidL` | 100, 123 | **Pivot at the TOP of the eye.** Scales 0 (open) → 1 (shut) downward |
| `lidR` | 200, 123 | |
| `lashes` | 150, 140 | Head-space overlay, drawn above the eyes |
| `muzzle` | 150, 205 | Muzzle patch and whiskers |
| `nose` | 150, 199 | |
| `blush` | 150, 185 | Both cheeks in one part; the game fades its alpha |
| `accessory` | 150, 70 | **Empty.** This is the anchor hats attach to — deliver nothing here |

### Mouths

Four shapes, all pivoting at **(150, 205)**, the muzzle centre:

| Shape | Used for |
|---|---|
| `norm` | Resting |
| `joy` | Happy — every stat above 72 |
| `sad` | Miserable — any stat below 28 |
| `open` | Eating, yawning, and voice mimic |

`open` is special: it is **scaled vertically at runtime**, from 0.15 to about
1.25, driven live by the amplitude of the player's recorded voice. Draw it at
its neutral open size and make sure it still reads when squashed flat and when
stretched tall.

---

## Format

- **Atlas**: one PNG plus a Phaser 3 JSON hash atlas (TexturePacker's "Phaser 3"
  preset is exactly right).
- **Frame names**: the part names above, verbatim, plus `mouth_norm`,
  `mouth_joy`, `mouth_sad`, `mouth_open`.
- **Pivots**: set each frame's pivot/anchor to the coordinate in the table. If
  your tool cannot export pivots, deliver each part trimmed with a note of its
  offset instead and we will map it.
- **Resolution**: draw at **3×** the 300 × 360 design space (900 × 1080) so it
  stays crisp on high-DPI phones. One scale is enough; the game scales down.
- **Transparency**: straight alpha, not premultiplied.
- **Hats**: same atlas, frames named `hat_bloom`, `hat_beanie`, `hat_party`,
  `hat_chef`, `hat_cans`, `hat_crown`, each drawn relative to the accessory
  anchor at (150, 70) so it sits on the head without per-hat tweaking.

---

## What happens on our side

Delivered art becomes a second `PetArtProvider` in `src/pet/` — roughly:

```ts
class AtlasPetArt implements PetArtProvider {
  readonly id = 'atlas-v1';
  createPart(scene, key) { return scene.add.image(0, 0, 'pet', key); }
  createMouths(scene) { /* four images, one per shape */ }
  createAccessory(scene, itemId) { return scene.add.image(0, 0, 'pet', `hat_${itemId}`); }
}
```

and one line in `HomeScene` passes it to `PetRig`. **No file outside
`src/pet/` changes** — that is an explicit acceptance criterion (§15), and it is
why the part list above is worth getting exactly right.

---

## Two constraints from the brief

1. **No reference to any competitor's brand** in file names, layer names,
   metadata or the artwork itself (§2.2). A repo test scans every committed file
   and will fail the build.
2. The character is **ours** — an original design, not a derivative of an
   existing published pet character. The genre is open; a specific cat is not.

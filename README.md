# Biskit

A virtual pet mobile game. Look after a small, very opinionated cat: feed it,
scrub it, put it to bed, play with it, and listen to it repeat you back in a
silly voice.

Built from the Biskit build prompt, using the prototype in
[`docs/reference/`](docs/reference/) as the design reference for layout, colour,
animation timing and feel. The prototype's code was read and discarded; none of
it is ported, and **none of its demo tuning is either** — production rates are
per hour and roughly 2000× slower.

The build prompt itself is deliberately not committed: it names competitor
brands in the clause forbidding them, and §15 requires zero brand references
anywhere in the repo. Keep it outside the repository.

---

## Quick start

```bash
npm install
npm run dev          # vite dev server on :5173
npm test             # 134 unit tests
npm run typecheck    # tsc --noEmit, strict
npm run lint         # eslint, including the currency-isolation rule
npm run build        # typecheck + production bundle into dist/
```

Android:

```bash
npx cap add android  # once; the native project is generated, not committed
npm run cap:android  # build, sync, open in Android Studio
```

---

## Stack

| Layer | Choice |
|---|---|
| Engine | Phaser 3.90 |
| Language | TypeScript, `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| Bundler | Vite 7 |
| Mobile | Capacitor 6 (Android first) |
| State | Plain TS store + typed emitter |
| Persistence | Capacitor Preferences |
| Tests | Vitest |

Bundle: 332 KB gzipped for Phaser, 30 KB for the game, zero image or audio
assets. Comfortably inside the 40 MB install budget.

---

## Architecture

```
src/
  config/
    tuning.ts       ALL balance numbers. Single source of truth.
    palette.ts      Colour tokens, lifted from the prototype's :root
  core/
    GameState.ts    The store: stats, wallet, level, inventory, timestamps
    StatSystem.ts   Decay, clamping, offline catch-up
    Economy.ts      spend / earn / canAfford — the ONLY money mutation path
    Progression.ts  XP, levels, unlocks
    SaveManager.ts  Serialise, load, migrate, integrity check
    Clock.ts        Server-time-aware now(); never trusts the device clock alone
    Audio.ts        SFX bus, ducking, mute
    DailyLogin.ts   Daily reward and streak
    GameContext.ts  Composition root; scenes share one instance via the registry
  pet/
    PetArt.ts       Every pixel of the placeholder pet. Swap this to swap the art.
    PetRig.ts       Bone/part registry, part swapping
    PetAnimator.ts  Named animation playback + blending
    IdleDirector.ts Unprompted idle scheduling + boredom escalation
    idlePolicy.ts   Phaser-free idle selection, so the rule is unit-testable
    MoodResolver.ts Stats -> facial expression
  scenes/
    BootScene · PreloadScene · HomeScene
    MiniGameScene · ShopScene · SettingsScene   (overlays over HomeScene)
    rooms.ts        Room layers + the static-art bake helper
  ui/
    Hud · MeterBar · ActionTray · NavBar · Toast · Sheet · Button · icons · bake
  services/
    Ads · Iap · Notifications · Analytics · VoiceMimic
```

### Rules the code enforces on itself

- **Every balance number lives in `config/tuning.ts`.** If a number appears in a
  scene file, that is a bug. `tests/repoHygiene.test.ts` scans for the specific
  values that would mean someone hard-coded a rule.
- **Currency moves only through `Economy`.** `GameState.applyCurrency` demands a
  capability token that only `Economy.ts` may import; ESLint blocks the call
  elsewhere, and a test forges a token to prove the runtime guard holds.
- **Rooms are layers, not scenes.** The pet is constructed once. The shop, the
  settings sheet and the mini-game all launch *over* `HomeScene`, so it never
  unloads or resets.
- **Art lives behind an interface.** Nothing outside `src/pet/` knows what a
  part looks like. Delivered art means writing a second `PetArtProvider` — most
  likely one that returns atlas frames — and handing it to `PetRig`.

### A note on rendering

Phaser re-tessellates and re-uploads a `Graphics` object on **every frame**, so
vector art that never changes costs the same standing still as it does moving.
Static art is baked once into cached textures (`src/ui/bake.ts`) and drawn as
image quads; identical icons share a texture. Inactive room layers are set
`visible = false` rather than left at `alpha 0`, which still costs a render
pass. Together these halved the median frame cost and the heap.

---

## Status against the acceptance criteria (§15)

| Criterion | Status |
|---|---|
| Cold start to interactive under 3s | **Likely, unverified on device.** 1.9s in headless Chromium with no GPU; no assets to load. Needs a real midrange Android to confirm. |
| Stable 60fps in Home with the pet idling | **Unverified.** Cannot be measured here — this container has no GPU and rasterises in software. The per-frame CPU work that *would* have blocked it has been removed (see above); on-device profiling is the outstanding task. |
| Offline catch-up correct for all seven §6 cases | **Done**, unit-tested: 0h, 1h, 8h, 18h, 40h, negative, 60-day, plus partial-sleep wake. |
| No stat ever reads 0 or above 100 | **Done**, tested including a 1000-hour absence. |
| Currency cannot be mutated outside `Economy.ts` | **Done** — capability token, ESLint rule, and tests. |
| Every balance number resolves to `config/tuning.ts` | **Done**, with a scanning test. |
| Save survives force-quit mid-action | **Done** — 500 ms debounce plus a forced flush on `pause`; worst case loses half a second. |
| Backwards device clock does not corrupt state or grant rewards | **Done** — `Clock` ignores a wall clock dragged backwards mid-session, and `StatSystem` applies zero decay and resets the stamp. |
| Mic permission denial leaves the game fully playable | **Done** — every failure path returns a message and nothing else. |
| Art parts swappable without touching any file outside `pet/` | **Done** — `PetArtProvider`. |
| Zero references to any competitor's brand | **Done**, with a scanning test over the whole repo. |

---

## Deviations and things you should know

1. **Ads and IAP have no SDK wired.** The mediation plugin (AppLovin MAX) and
   `@capacitor-community/in-app-purchases` do not resolve on this npm registry,
   so `Ads` and `Iap` sit behind `RewardedAdProvider` / `IapProvider` with a stub
   implementation. Everything that matters — the 10/day cap, the device-local
   date rollover, the level-3 gate, granting nothing on a fill failure — is real
   and covered by tests. Shipping means writing one adapter each and calling
   `ads.setProvider(...)` / `iap.setProvider(...)` in `main.ts`.

2. **The §8 XP table in the spec does not match the §8 formula.** The spec gives
   `xpForLevel(n) = floor(80 * n^1.35)` and then lists "L5 688"; that formula
   actually yields 702 at level 5 (and 203 at L2, 352 at L3, 1790 at L10, 4567
   at L20). The formula is implemented as written, since it was given as code.
   If the listed numbers were the intended curve, the exponent needs changing —
   worth a decision either way.

3. **Fonts are not bundled.** The design calls for Fredoka and Plus Jakarta
   Sans; a packaged app must not fetch them at boot. The platform UI font is
   used until the two woff2 files are dropped into `public/fonts/` and the
   commented `@font-face` blocks in `index.html` are enabled.

4. **The pet is placeholder art**, drawn as vector primitives matching the
   prototype's proportions. Per §2.1 no character art was generated or scraped.

5. **Server sync is not built.** §12 marks it optional for v1.

6. **iOS is configured but not the target.** §1 says Android first.

---

## Open questions (§17) — answers change what ships

These were not assumed away. Current state and what changes with each answer:

1. **Final character art: commissioned, or asset-store base customised?**
   Either works without code changes — the rig takes a `PetArtProvider`. The
   answer affects the delivery format we should ask for (an atlas with one frame
   per named part, matching `PartKey`, is what slots in with least work).

2. **Is a second mini-game in v1 scope, or v1.1?**
   Not built. `UNLOCK_LEVEL.secondMiniGame = 5` reserves the gate and is tested,
   and `MiniGameScene` is self-contained enough to sit alongside a sibling. If
   it is v1, this is the next feature to spec.

3. **iOS at launch, or Android-only first?**
   Built Android-first per §1. `capacitor.config.ts` carries iOS settings, and
   nothing in the code is Android-specific, so adding iOS is `npx cap add ios`
   plus device testing — but that testing is not free, so it needs deciding.

4. **Is a "remove ads" IAP wanted, or ads-only monetisation?**
   §13 asks for confirmation before building it, so it is wired but **off**:
   `FEATURES.removeAdsIap` gates the SKU and its settings row. Flip that flag
   and it appears in Settings, backed by the entitlement and restore paths that
   already exist. Coin packs are built and live in the shop.

---

## Testing

134 tests, all pure — no canvas, no device, no network.

| File | Covers |
|---|---|
| `statSystem.test.ts` | Decay table, sleep model, floors, the seven §6 offline cases, clock-driven ticking |
| `economy.test.ts` | Spend/earn/deny, analytics threading, the currency guard |
| `progression.test.ts` | XP curve, multi-level awards, content gates |
| `saveManager.test.ts` | Field-by-field validation, corruption, migration, debounce and flush |
| `clock.test.ts` | Backwards-clock guard, server offset, day keys |
| `notifications.test.ts` | Threshold prediction, quiet hours across midnight, the two-a-day cap |
| `ads.test.ts` | Daily cap, date rollover, level gate, and granting nothing on failure |
| `dailyLogin.test.ts` | Streaks, resets, the escalating reward table |
| `iap.test.ts` | Coin packs, the level gate vs. store readiness, restore, the remove-ads flag |
| `pet.test.ts` | Mood resolution, idle pool and boredom escalation |
| `repoHygiene.test.ts` | Brand references, localStorage, balance numbers, currency isolation |

The game was also driven end to end in headless Chromium — every room, feeding,
scrubbing, sleep, the shop, settings, a full mini-game round — with no console
errors. Two flows were checked against their specified behaviour rather than
just "did not crash":

- **Offline catch-up.** A save rewound six hours produces exactly the decay the
  tuning table predicts; forty hours clamps to the eighteen-hour cap and lands
  identical to an eighteen-hour absence; a save stamped in the future changes
  nothing at all.
- **Monetisation gates.** At level 1 neither the rewarded-video button nor the
  coin packs exist. At level 5 both appear, and tapping a pack with no billing
  library says "The store is not available on this device right now" rather
  than failing silently.

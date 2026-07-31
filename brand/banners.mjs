/**
 * Five 1600x900 banners, built from the game's own pixels.
 *
 * Every picture here came out of `shots.mjs`, which is the game photographing
 * itself — nothing is drawn by hand, because the brief says not to invent
 * character art and because a banner showing art the game does not have is a
 * banner that lies. The caption band is cropped off each card (the bottom 112
 * of 1050) since the banner carries its own wordmark.
 *
 * The dressing around the pictures is where "premium" is bought, and it is
 * bought with four things, none of them decoration for its own sake:
 *
 *  DEVICE. Each shot sits in a phone bezel with a rim light and a diagonal
 *  gloss. A 4:5 rectangle floating on a gradient reads as a screenshot; the
 *  same rectangle in a handset reads as a product.
 *
 *  GRAIN. A fractal-noise overlay at 14%. Flat CSS gradients band visibly at
 *  1600px on any real screen, and the banding is the single loudest "made in a
 *  browser" tell. Noise dithers it away.
 *
 *  FOIL. Accents are a three-stop gold ramp clipped to the glyphs, not a flat
 *  #ffd46b. Flat gold reads as yellow text; a ramp reads as metal.
 *
 *  THE REAL MARK. `brand/logo-mark.png`, the shipped app icon, rather than an
 *  emoji in a circle. The brand kit exists; using it is free.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

// Run from the repo root, like brand/render.mjs:
//   node brand/shots.mjs && node brand/banners.mjs
const shots = JSON.parse(readFileSync('brand/shots.json', 'utf8'));
/**
 * The shipped app mark, NOT the lockup PNG. The lockup carries a tagline set
 * at 1200px wide; at the 56px a banner wants it that line lands around six
 * pixels tall and turns to mush. The mark is one shape and survives any size,
 * so the wordmark is set live in Fredoka next to it — same font the lockup
 * uses, and crisp at 1x.
 */
const mark = `data:image/png;base64,${readFileSync('brand/logo-mark.png').toString('base64')}`;

const W = 1600;
const H = 900;
/** Fraction of a card that is picture, not caption band. 938 of 1050. */
const PIC = 938 / 1050;

/**
 * Inlined rather than fetched, for the reason render.mjs gives: left to a font
 * stack the headline silently bakes in whatever generic sans is installed, and
 * that is the difference between a brand asset and a screenshot of one. Base64
 * also means the composition step needs no server at all.
 *
 * SIL Open Font License 1.1 — see brand/OFL-Fredoka.txt.
 */
const FREDOKA = readFileSync('brand/fredoka.woff2').toString('base64');
const FONT = `@font-face{font-family:Fredoka;font-weight:300 700;font-display:block;` +
  `src:url(data:font/woff2;base64,${FREDOKA}) format('woff2')}`;

/** Fractal noise, inline. Kills gradient banding across 1600px of purple. */
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>" +
  "</filter><rect width='220' height='220' filter='url(%23n)' opacity='0.55'/></svg>\")";

const CSS = `
${FONT}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;position:relative;
  font-family:Fredoka,system-ui,sans-serif;color:#efe8f8;background:#0d0916;
  -webkit-font-smoothing:antialiased}

/* ---- the stage -------------------------------------------------------- */
.bg{position:absolute;inset:0;background:
  radial-gradient(1250px 820px at 50% -20%, rgba(186,152,255,.40), transparent 62%),
  radial-gradient(920px 700px at 93% 8%, rgba(255,148,192,.20), transparent 60%),
  radial-gradient(820px 620px at 3% 92%, rgba(118,214,190,.13), transparent 62%),
  linear-gradient(180deg,#241a3a 0%,#170f27 56%,#0d0916 100%)}
.bg.warm{background:
  radial-gradient(900px 560px at 50% -14%, rgba(255,198,104,.30), transparent 62%),
  radial-gradient(1000px 760px at 86% 16%, rgba(176,124,255,.26), transparent 62%),
  radial-gradient(760px 620px at 8% 84%, rgba(255,140,190,.13), transparent 64%),
  linear-gradient(180deg,#2b1c44 0%,#1b1130 55%,#0e0819 100%)}
.grain{position:absolute;inset:0;opacity:.14;mix-blend-mode:overlay;
  background-image:${GRAIN};background-size:220px 220px}
.vig{position:absolute;inset:0;
  background:radial-gradient(130% 100% at 50% 40%, transparent 48%, rgba(0,0,0,.44) 100%)}
/* A hairline poster frame. One pixel, but it turns a picture into a print. */
.frame{position:absolute;inset:20px;border-radius:24px;pointer-events:none;
  border:1px solid rgba(255,255,255,.09);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.10), inset 0 -1px 0 rgba(0,0,0,.35)}
.frame.gold{border-color:rgba(255,212,107,.26);
  box-shadow:inset 0 1px 0 rgba(255,225,160,.22), inset 0 -1px 0 rgba(0,0,0,.4)}
/* Soft coloured light behind the hero device. */
.glow{position:absolute;border-radius:50%;filter:blur(90px);opacity:.6}

.wrap{position:absolute;inset:0;display:flex;align-items:center;padding:0 78px;gap:60px}
.col{display:flex;flex-direction:column;align-items:stretch}

/* ---- type ------------------------------------------------------------- */
/* align-self matters: inside a flex column, an auto-width image is STRETCHED
   to the column and the mark comes out as a wide smear. */
.logo{display:flex;align-items:center;gap:16px;margin-bottom:26px;align-self:flex-start}
.logo img{width:58px;height:58px;border-radius:17px;display:block;
  box-shadow:0 10px 26px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.18)}
.logo .wm{font-size:35px;font-weight:700;letter-spacing:-.015em;color:#fff;line-height:1}
.logo .tag{display:block;margin-top:5px;font-size:12px;font-weight:600;
  letter-spacing:.20em;text-transform:uppercase;color:#a38fc6}
h1{font-size:84px;font-weight:700;line-height:1.02;letter-spacing:-.025em;
  background:linear-gradient(178deg,#ffffff 8%,#e3d5ff 92%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 10px 26px rgba(0,0,0,.45))}
h1 em{font-style:normal;
  background:linear-gradient(178deg,#ffd0e2 6%,#ff8fbb 55%,#e4699b 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
h1 .g{background:linear-gradient(178deg,#d9c6ff 6%,#a88bd8 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
h1 .gold{background:linear-gradient(176deg,#fff4cf 4%,#ffd46b 46%,#d9a13a 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.eyebrow{display:flex;align-items:center;gap:12px;margin-bottom:20px;
  font-size:16px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#b9a8d6}
.eyebrow .line{width:46px;height:1px;background:linear-gradient(90deg,#ffd46b,transparent)}
p.lede{font-size:26px;line-height:1.5;color:#c7bad9;max-width:660px;margin-top:24px;font-weight:400}

/* A pill with a gradient rim rather than a flat border. */
.pill{display:inline-flex;align-items:center;gap:11px;align-self:flex-start;
  padding:8px 20px 8px 8px;border-radius:99px;font-size:19px;font-weight:500;color:#f0e6d0;
  background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.03));
  box-shadow:inset 0 0 0 1px rgba(255,212,107,.30), 0 10px 26px rgba(0,0,0,.35)}
.pill b{background:linear-gradient(180deg,#ffe9ae,#f0b93f);color:#4d3208;
  padding:4px 13px;border-radius:99px;font-size:14px;font-weight:700;
  letter-spacing:.10em;text-transform:uppercase;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}

.url{position:absolute;right:78px;bottom:46px;font-size:31px;font-weight:700;
  letter-spacing:-.01em;
  background:linear-gradient(176deg,#fff4cf,#ffd46b 50%,#d9a13a);
  -webkit-background-clip:text;background-clip:text;color:transparent}

/* ---- the device ------------------------------------------------------- */
.phone{position:relative;border-radius:40px;padding:10px;
  background:linear-gradient(150deg,rgba(255,255,255,.40) 0%,rgba(255,255,255,.07) 34%,
    rgba(255,255,255,.03) 62%,rgba(255,255,255,.22) 100%);
  box-shadow:0 46px 90px -24px rgba(0,0,0,.80), 0 0 0 1px rgba(255,255,255,.05)}
.phone.sm{border-radius:30px;padding:7px}
.phone.gold{background:linear-gradient(150deg,rgba(255,224,150,.55) 0%,rgba(255,212,107,.10) 36%,
    rgba(255,255,255,.03) 64%,rgba(255,224,150,.34) 100%)}
.screen{position:relative;border-radius:31px;overflow:hidden;background:#1a1226}
.phone.sm .screen{border-radius:24px}
.screen img{display:block;width:100%;object-fit:cover;object-position:center top}
/* Glass: one diagonal sweep, low enough not to wash out her face. */
.screen .gloss{position:absolute;inset:0;
  background:linear-gradient(118deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,.07) 15%,
    transparent 32%,transparent 100%)}
.screen .rim{position:absolute;inset:0;border-radius:inherit;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}

.item{display:flex;flex-direction:column;align-items:center;flex:1;min-width:0}
.label{margin-top:16px;font-size:19px;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:#e8dcf7;text-align:center}
.sub{margin-top:6px;font-size:17px;font-weight:600;letter-spacing:.04em;
  background:linear-gradient(176deg,#fff4cf,#ffd46b 50%,#d9a13a);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.row{display:flex;align-items:flex-start}

/* ---- glass feature rows ----------------------------------------------- */
.feat{display:flex;flex-direction:column;gap:14px;margin-top:30px}
.feat div{display:flex;align-items:center;gap:16px;padding:13px 20px;border-radius:16px;
  font-size:23px;color:#e9e0f6;font-weight:500;
  background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.feat i{flex:0 0 44px;height:44px;border-radius:14px;display:grid;place-items:center;
  font-style:normal;font-size:21px;
  background:linear-gradient(160deg,rgba(255,212,107,.22),rgba(168,139,216,.20));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}

/* ---- the counted facts, along the bottom of the hero ------------------- */
.stats{display:flex;align-self:flex-start;margin-top:38px;
  border-radius:18px;overflow:hidden;
  background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08), 0 14px 34px rgba(0,0,0,.35)}
.stats div{padding:14px 26px;text-align:center}
.stats div + div{box-shadow:inset 1px 0 0 rgba(255,255,255,.08)}
.stats b{display:block;font-size:27px;font-weight:700;line-height:1.1;
  background:linear-gradient(176deg,#fff4cf,#ffd46b 50%,#d9a13a);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.stats span{display:block;margin-top:3px;font-size:13px;font-weight:600;
  letter-spacing:.16em;text-transform:uppercase;color:#a798c4}
`;

/** The stage layers. Same for every banner; `tint` swaps the palette. */
const chrome = (tint = '') =>
  `<div class="bg ${tint}"></div><div class="grain"></div><div class="vig"></div>` +
  `<div class="frame ${tint === 'warm' ? 'gold' : ''}"></div>`;

const brand = `<div class="logo"><img src="${mark}" alt="">
  <div><span class="wm">Biskit</span><span class="tag">Virtual pet</span></div></div>`;

/** One photograph in a handset, cropped past its caption band. */
function phone(name, h, { sm = false, gold = false } = {}) {
  const pad = sm ? 7 : 10;
  const w = Math.round((h * 840) / 938);
  return `<div class="phone${sm ? ' sm' : ''}${gold ? ' gold' : ''}" style="width:${w + pad * 2}px">
    <div class="screen" style="height:${h}px">
      <img src="${shots[name]}" style="height:${Math.round(h / PIC)}px">
      <div class="gloss"></div><div class="rim"></div>
    </div>
  </div>`;
}

/** A handset in a column with a caption under it, sized by the row. */
function item(name, label, h, sub = '', gold = false) {
  return `<div class="item">
    <div class="phone sm${gold ? ' gold' : ''}" style="width:100%">
      <div class="screen" style="height:${h}px">
        <img src="${shots[name]}" style="height:${Math.round(h / PIC)}px">
        <div class="gloss"></div><div class="rim"></div>
      </div>
    </div>
    <div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}
  </div>`;
}

const BANNERS = {
  /* 1 — introduction */
  '01-intro': `${chrome()}
  <div class="glow" style="width:620px;height:620px;right:60px;top:120px;
    background:radial-gradient(circle,#a06fd8,transparent 66%)"></div>
  <div class="glow" style="width:420px;height:420px;right:420px;bottom:20px;
    background:radial-gradient(circle,#ff7fae,transparent 66%);opacity:.35"></div>
  <div class="wrap">
    <div class="col" style="flex:1">
      ${brand}
      <span class="pill"><b>New</b>Plays in your browser — no install</span>
      <h1 style="margin-top:26px">A small cat who<br><em>actually misses</em><br><span class="g">you.</span></h1>
      <p class="lede">Feed her, scrub her, tuck her in — and she keeps living while the app is closed.</p>
      <!-- Counted, not claimed: 5 rooms, 10 hats + 6 outfits + 5 rugs, 16 awards. -->
      <div class="stats">
        <div><b>5</b><span>Rooms</span></div>
        <div><b>21</b><span>Things to own</span></div>
        <div><b>16</b><span>Awards</span></div>
        <div><b>Free</b><span>To play</span></div>
      </div>
    </div>
    <div style="perspective:1700px">
      <div style="transform:rotateY(-10deg) rotateX(2deg) rotateZ(-1.2deg)">${phone('hero', 690)}</div>
    </div>
  </div>
  <div class="url">biskit.fun</div>`,

  /* 2 — the rooms */
  '02-rooms': `${chrome()}
  <div class="glow" style="width:1100px;height:420px;left:250px;top:-90px;
    background:radial-gradient(circle,#8f6fc9,transparent 68%);opacity:.45"></div>
  <div class="wrap" style="flex-direction:column;align-items:stretch;justify-content:center;padding:46px 78px">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:30px">
      <div>
        ${brand}
        <h1 style="font-size:62px">Five rooms. <span class="g">One cat.</span></h1>
      </div>
      <p class="lede" style="font-size:22px;max-width:420px;text-align:right;margin:0 0 6px">
        Every need has a room, and she will tell you which one she wants.</p>
    </div>
    <div class="row" style="gap:22px">
      ${item('hero', 'Home', 402)}
      ${item('kitchen', 'Food', 402)}
      ${item('bath', 'Bath', 402)}
      ${item('bed', 'Sleep', 402)}
      ${item('loo', 'Loo', 402)}
    </div>
  </div>
  <div class="url" style="bottom:26px">biskit.fun</div>`,

  /* 3 — dress up and share */
  '03-dressup': `${chrome()}
  <div class="glow" style="width:900px;height:400px;left:120px;top:-80px;
    background:radial-gradient(circle,#ff7fae,transparent 68%);opacity:.32"></div>
  <div class="wrap" style="flex-direction:column;align-items:stretch;justify-content:center;padding:46px 78px">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:26px">
      <div>
        ${brand}
        <h1 style="font-size:62px">Dress her up. <em>Show her off.</em></h1>
      </div>
      <div class="feat" style="margin:0;gap:9px;flex:0 0 452px">
        <div style="font-size:19px;padding:9px 16px"><i style="flex-basis:38px;height:38px;font-size:19px;border-radius:12px">🎩</i>Ten hats, six outfits, five rugs</div>
        <div style="font-size:19px;padding:9px 16px"><i style="flex-basis:38px;height:38px;font-size:19px;border-radius:12px">📷</i>One tap makes a card to send</div>
        <div style="font-size:19px;padding:9px 16px"><i style="flex-basis:38px;height:38px;font-size:19px;border-radius:12px">🪙</i>First share each day pays coins</div>
      </div>
    </div>
    <div class="row" style="gap:26px">
      ${item('tutu', 'Tutu', 398, 'with Bloom')}
      ${item('dungarees', 'Dungarees', 398, 'with Beanie')}
      ${item('hoodie', 'Hoodie', 398, 'with Headset')}
      ${item('crown', 'Raincoat', 398, 'with Crown')}
    </div>
  </div>
  <div class="url" style="bottom:26px">biskit.fun</div>`,

  /* 4 — she answers */
  '04-voice': `${chrome()}
  <div class="glow" style="width:640px;height:640px;left:40px;top:110px;
    background:radial-gradient(circle,#7f6fd8,transparent 66%);opacity:.5"></div>
  <div class="wrap">
    <div style="perspective:1700px">
      <div style="transform:rotateY(9deg) rotateX(2deg) rotateZ(1.2deg)">${phone('wizard', 680)}</div>
    </div>
    <div class="col" style="flex:1">
      ${brand}
      <div class="eyebrow"><span class="line"></span>Voice &amp; personality</div>
      <h1 style="font-size:70px">She answers<br><em>back.</em></h1>
      <div class="feat">
        <div><i>🎤</i>Say anything — she repeats it in a silly voice</div>
        <div><i>💬</i>Opinions of her own, and she is not shy</div>
        <div><i>🐾</i>Meows, purrs, chirrups and one very rude hiss</div>
        <div><i>🌙</i>Come back tomorrow and she will mention it</div>
      </div>
    </div>
  </div>
  <div class="url">biskit.fun</div>`,

  /* 5 — the rare rack. Every price below is the real one from tuning.ts. */
  '05-premium': `${chrome('warm')}
  <div class="glow" style="width:1150px;height:420px;left:225px;top:-120px;
    background:radial-gradient(circle,#ffc86b,transparent 66%);opacity:.30"></div>
  <div class="wrap" style="flex-direction:column;align-items:center;justify-content:center;
    text-align:center;padding:44px 74px;gap:0">
    <div class="logo" style="align-self:center;margin-bottom:18px"><img src="${mark}" alt="">
      <div><span class="wm">Biskit</span><span class="tag">Virtual pet</span></div></div>
    <span class="pill" style="align-self:center;margin-bottom:18px"><b>Gems</b>Not for sale, at any price</span>
    <h1 style="font-size:60px">The <span class="gold">rare</span> rack</h1>
    <p class="lede" style="text-align:center;max-width:860px;margin:16px auto 26px;font-size:22px">
      Six pieces priced in gems — and gems are the one thing money cannot buy.
      They come from levelling up and from milestones that never reset.</p>
    <div class="row" style="width:100%;gap:16px">
      ${item('gemHalo', 'Halo', 318, '8 gems', true)}
      ${item('gemTutu', 'Tutu', 318, '12 gems', true)}
      ${item('gemWizard', 'Wizard', 318, '14 gems', true)}
      ${item('gemAstro', 'Astro', 318, '20 gems', true)}
      ${item('gemSpace', 'Space suit', 318, '24 gems', true)}
      ${item('gemRainbow', 'Rainbow', 318, '28 gems', true)}
    </div>
  </div>
  <div class="url" style="bottom:26px">biskit.fun</div>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
for (const [name, body] of Object.entries(BANNERS)) {
  await page.setContent(`<style>${CSS}</style>${body}`);
  // Block until the face is usable, or the first paint uses the fallback and
  // the fallback is what gets captured.
  await page.evaluate(() => document.fonts.load('700 84px Fredoka').then(() => document.fonts.ready));
  await page.waitForTimeout(600);
  const out = `brand/banners/banner-${name}.png`;
  const png = await page.screenshot();
  writeFileSync(out, png);
  console.log(`${out}  ${W}x${H}  ${(png.length / 1024).toFixed(0)} KB`);
}
await browser.close();

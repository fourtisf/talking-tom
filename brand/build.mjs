/**
 * Generates every brand SVG from one place.
 *
 * The cat is never redrawn here: `_parts_head.svg` and `_parts_full.svg` are
 * lifted verbatim from the hero SVG in index.html, which is itself kept in step
 * with src/pet/PetArt.ts. Change the cat in the game and re-extract.
 *
 *   node brand/build.mjs && node brand/render.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const HEAD = readFileSync('brand/_parts_head.svg', 'utf8');
const FULL = readFileSync('brand/_parts_full.svg', 'utf8');

/**
 * Measured, not guessed — see brand/README.md. The head's EAR TIPS are the
 * corners a circular crop cuts first, so any round framing is scaled from them.
 */
const HEAD_C = { x: 150.0, y: 135.1 };
const HEAD_HALF = { w: 94.0, h: 104.9 };
const EAR_REACH = Math.hypot(HEAD_HALF.w, HEAD_HALF.h); // 140.9
const FULL_C = { x: 173.4, y: 190.6 };

/** Namespaced, so several copies can share one document without stealing fills. */
const art = (source, tag) =>
  source.replace(/url\(#(iris|fur)\)/g, (_, id) => `url(#${id}-${tag})`);

const catDefs = (tag) => `
    <radialGradient id="iris-${tag}" cx="38%" cy="30%" r="72%">
      <stop offset="0%" stop-color="#8fd4f7"/>
      <stop offset="55%" stop-color="#4ba8e8"/>
      <stop offset="100%" stop-color="#2a72b8"/>
    </radialGradient>
    <linearGradient id="fur-${tag}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#ede2f6"/>
    </linearGradient>`;

/**
 * The depth kit. Flat vector on a flat gradient is what made the first pass
 * read as clip art: no contact shadow under the subject, no falloff at the
 * edges, no light source you can point at.
 */
const depthDefs = `
    <radialGradient id="lift" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3d2c63" stop-opacity=".38"/>
      <stop offset="55%" stop-color="#3d2c63" stop-opacity=".17"/>
      <stop offset="100%" stop-color="#3d2c63" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
    <filter id="cast" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#2e2340" flood-opacity=".30"/>
    </filter>
    <filter id="castSm" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#2e2340" flood-opacity=".34"/>
    </filter>`;

/** Four-point sparkle, the shape the game's `star` icon already uses. */
const sparkle = (x, y, r, o = 0.9, fill = '#ffffff') =>
  `<path d="M${x} ${y - r}Q${x + r * 0.17} ${y - r * 0.17} ${x + r} ${y}` +
  `Q${x + r * 0.17} ${y + r * 0.17} ${x} ${y + r}` +
  `Q${x - r * 0.17} ${y + r * 0.17} ${x - r} ${y}` +
  `Q${x - r * 0.17} ${y - r * 0.17} ${x} ${y - r}Z" fill="${fill}" opacity="${o}"/>`;

/* ------------------------------------------------------------------ *
 * 1. The mark — an app icon, and the source of every round crop
 * ------------------------------------------------------------------ */

/**
 * A FULL SQUARE, always. Nothing here rounds its own corners.
 *
 * Every consumer applies its own mask: X crops the avatar to a circle, iOS and
 * Google Play mask the store icon and both REJECT an icon that arrives with
 * alpha or pre-rounded corners. Clipping here only guarantees the corners are
 * empty, and an empty corner is not transparent by the time it is a PNG — it
 * composites to white, which is what a pre-rounded avatar looks like on X: a
 * purple disc sitting on a white square.
 *
 * The subject is still sized against the CIRCLE, since that is the tightest
 * mask any of them applies.
 *
 * @param size  canvas edge
 * @param tag   gradient namespace
 * @param safe  how far out of `size / 2` the ear tips may reach
 */
function mark(size, tag, safe) {
  const s = size / 2;
  const scale = +(safe / EAR_REACH).toFixed(4);
  // A touch low: the ears need more headroom above than the chin needs below.
  const placeY = s + size * 0.02;
  return `
  <defs>
    ${catDefs(tag)}
    ${depthDefs}
    <linearGradient id="skin-${tag}" x1="0.15" y1="0" x2="0.72" y2="1">
      <stop offset="0%" stop-color="#c9b3ee"/>
      <stop offset="50%" stop-color="#a88bd8"/>
      <stop offset="100%" stop-color="#7d63b6"/>
    </linearGradient>
    <radialGradient id="key-${tag}" cx="50%" cy="14%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".34"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rim-${tag}" cx="50%" cy="50%" r="52%">
      <stop offset="78%" stop-color="#2e2340" stop-opacity="0"/>
      <stop offset="100%" stop-color="#2e2340" stop-opacity=".26"/>
    </radialGradient>
  </defs>

  <g>
    <rect width="${size}" height="${size}" fill="url(#skin-${tag})"/>
    <ellipse cx="${s}" cy="${size * 0.1}" rx="${size * 0.62}" ry="${size * 0.44}" fill="url(#key-${tag})"/>

    ${sparkle(size * 0.19, size * 0.23, size * 0.032, 0.62)}
    ${sparkle(size * 0.83, size * 0.17, size * 0.023, 0.5)}
    ${sparkle(size * 0.87, size * 0.62, size * 0.017, 0.42)}

    <ellipse cx="${s}" cy="${size * 0.895}" rx="${size * 0.3}" ry="${size * 0.062}" fill="url(#lift)"/>

    <g filter="url(#cast)">
      <g transform="translate(${s} ${placeY}) scale(${scale}) translate(${-HEAD_C.x} ${-HEAD_C.y})">
${art(HEAD, tag)}
      </g>
    </g>

    <rect width="${size}" height="${size}" fill="url(#rim-${tag})"/>
  </g>`;
}

writeFileSync(
  'brand/logo-mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>Biskit</title>
  <!-- App icon, 1024, FULL SQUARE and fully opaque. iOS and Google Play both
       reject an icon with alpha or pre-rounded corners and apply their own
       mask. Generated by brand/build.mjs — do not edit by hand. -->
${mark(1024, 'm', 404)}
</svg>
`,
);

writeFileSync(
  'brand/x-avatar.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <title>Biskit</title>
  <!-- X profile picture. Upload a FULL SQUARE — X applies the circular mask
       itself, and a pre-cropped disc arrives with white corners. Head only and
       no text, because X renders this as small as 48px, and the ear tips stay
       inside the circle X will cut. Generated by brand/build.mjs. -->
${mark(400, 'a', 174)}
</svg>
`,
);

/* ------------------------------------------------------------------ *
 * 2. Lockup — mark plus wordmark, transparent
 * ------------------------------------------------------------------ */

function lockup(tag, wordTop, wordBottom, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 340" width="1200" height="340">
  <title>Biskit</title>
  <!-- Horizontal lockup on transparent, for a README header or a press kit.
       Generated by brand/build.mjs — do not edit by hand. -->
  <defs>
    ${catDefs(tag)}
    ${depthDefs}
    <linearGradient id="skin-${tag}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#e0d2f8"/>
      <stop offset="42%" stop-color="#ab8ede"/>
      <stop offset="100%" stop-color="#63499b"/>
    </linearGradient>
    <radialGradient id="key-${tag}" cx="50%" cy="16%" r="66%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".52"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="clip-${tag}"><rect x="0" y="0" width="260" height="260" rx="60" ry="60"/></clipPath>
    <linearGradient id="word-${tag}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${wordTop}"/>
      <stop offset="100%" stop-color="${wordBottom}"/>
    </linearGradient>
  </defs>

  <g transform="translate(30 40)" filter="url(#castSm)">
    <g clip-path="url(#clip-${tag})">
      <rect width="260" height="260" fill="url(#skin-${tag})"/>
      <ellipse cx="130" cy="26" rx="161" ry="114" fill="url(#key-${tag})"/>
      <ellipse cx="130" cy="234" rx="109" ry="34" fill="url(#lift)"/>
      <g transform="translate(130 135) scale(${(94 / EAR_REACH).toFixed(4)}) translate(${-HEAD_C.x} ${-HEAD_C.y})">
${art(HEAD, tag)}
      </g>
    </g>
  </g>

  <g transform="translate(336 0)">
    <text x="0" y="196" font-family="Fredoka, system-ui, sans-serif" font-size="188"
          font-weight="700" letter-spacing="-5" fill="url(#word-${tag})">Biskit</text>
    <text x="6" y="252" font-family="Fredoka, system-ui, sans-serif" font-size="40"
          font-weight="500" fill="${sub}">A small cat who actually misses you</text>
  </g>
</svg>
`;
}

// Both polarities. A single white-on-transparent lockup disappears the moment
// it lands on a light page, which is most pages.
writeFileSync('brand/logo-lockup.svg', lockup('l', '#3b2a5e', '#6b4f9e', '#7d6aa3'));
writeFileSync('brand/logo-lockup-dark.svg', lockup('ld', '#ffffff', '#ddccf7', '#c9b8e8'));

/* ------------------------------------------------------------------ *
 * 3. Banner
 * ------------------------------------------------------------------ */

const W = 1500;
const H = 500;
/**
 * X's own profile disc covers roughly x 90..330 / y 330..500, and a narrow
 * window keeps only the middle 60% (x 300..1200). Everything that matters sits
 * inside that band and clear of that disc.
 */
// Her tail is the rightmost thing on the canvas, and at 1078 it landed at
// x 1202 — two units past where a narrow window stops keeping pixels, which
// is enough to slice the tip off. Measured, not guessed: the silhouette now
// runs 937..1187 with the drop shadow inside the band too.
const CAT_X = 1062;
const TEXT_X = 372;

/** A soft out-of-focus orb. Depth without anything to identify. */
const bokeh = (x, y, r, o, fill = '#ffffff') =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${o}" filter="url(#blurLg)"/>`;

/**
 * Frosted pill, sized from its own label so the padding is even on every one.
 * Fredoka at 18px averages a shade over 9 units per character.
 */
const chip = (x, y, label) => {
  const w = Math.round(label.length * 9.3 + 34);
  return `
  <g transform="translate(${x} ${y})">
    <rect width="${w}" height="38" rx="19" fill="#ffffff" opacity=".12"/>
    <rect width="${w}" height="38" rx="19" fill="none" stroke="#ffffff" stroke-opacity=".30" stroke-width="1.5"/>
    <text x="${w / 2}" y="24.5" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif"
          font-size="18" font-weight="500" fill="#f0e7ff">${label}</text>
  </g>`;
};

/** Laid out left to right with an even gutter, so nothing has to be measured by hand. */
function chipRow(x, y, labels, gap = 14) {
  let cursor = x;
  return labels
    .map((label) => {
      const out = chip(cursor, y, label);
      cursor += Math.round(label.length * 9.3 + 34) + gap;
      return out;
    })
    .join('');
}

writeFileSync(
  'brand/x-banner.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title>Biskit — a small cat who actually misses you</title>
  <!--
    X header, 1500x500. Generated by brand/build.mjs — do not edit by hand.

    NOT the game's room. An earlier version drew the literal wall, skirting
    board and floorboards, which made the banner read as a screenshot with text
    laid over it. This is a poster: the brand's own colours as atmosphere, the
    cat lit on a pool of light, and nothing that pretends to be a place.

    The ground is DEEP. The pass before this one was pale lavender, and white
    type on pale lavender is white type nobody can read — the wordmark, the
    largest thing on the canvas, was the hardest thing on it to see. A white cat
    and white type both need something dark to sit against, and the game's own
    background (--ink #221a33 under a grape wash) already is that.

    Safe zones are documented in brand/README.md and checked by compositing the
    avatar and the crop over the output, not assumed.
  -->
  <defs>
    ${catDefs('b')}
    ${depthDefs}

    <linearGradient id="sky" x1="0.05" y1="0" x2="0.95" y2="1">
      <stop offset="0%" stop-color="#3b2a63"/>
      <stop offset="46%" stop-color="#2c2047"/>
      <stop offset="100%" stop-color="#241a37"/>
    </linearGradient>
    <!-- The key light, up and left of the cat: the same direction her own
         highlight is painted from, so the scene and the subject agree. -->
    <radialGradient id="key" cx="63%" cy="2%" r="66%">
      <stop offset="0%" stop-color="#ffcf94" stop-opacity=".40"/>
      <stop offset="55%" stop-color="#c99adf" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#c99adf" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="rose" cx="10%" cy="98%" r="62%">
      <stop offset="0%" stop-color="#ff7fb5" stop-opacity=".30"/>
      <stop offset="100%" stop-color="#ff7fb5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="mintGlow" cx="97%" cy="88%" r="46%">
      <stop offset="0%" stop-color="#5fd0aa" stop-opacity=".26"/>
      <stop offset="100%" stop-color="#5fd0aa" stop-opacity="0"/>
    </radialGradient>
    <!-- A scrim under the copy. The gradient behind it shifts across 1500px,
         and type legibility should not depend on where in that shift it lands. -->
    <radialGradient id="scrim" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#17102a" stop-opacity=".50"/>
      <stop offset="100%" stop-color="#17102a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="stage" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe9c4" stop-opacity=".40"/>
      <stop offset="55%" stop-color="#e7c9f2" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#e7c9f2" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f4e6ff" stop-opacity=".26"/>
      <stop offset="100%" stop-color="#f4e6ff" stop-opacity="0"/>
    </radialGradient>

    <filter id="blurLg" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="42"/>
    </filter>
    <filter id="lift" x="-25%" y="-60%" width="150%" height="220%">
      <feDropShadow dx="0" dy="3" stdDeviation="7" flood-color="#160f28" flood-opacity=".55"/>
    </filter>

    <!--
      Film grain. Two jobs: it stops a 1500px gradient banding into visible
      steps on a phone screen, and a perfectly clean gradient is the single
      loudest tell of vector art that has not been finished.
    -->
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>

    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#150e26" stop-opacity=".46"/>
      <stop offset="15%" stop-color="#150e26" stop-opacity="0"/>
      <stop offset="85%" stop-color="#150e26" stop-opacity="0"/>
      <stop offset="100%" stop-color="#150e26" stop-opacity=".46"/>
    </linearGradient>
    <linearGradient id="word" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#dcc6fb"/>
    </linearGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b6f3dc"/>
      <stop offset="100%" stop-color="#6fd2ae"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#key)"/>
  <rect width="${W}" height="${H}" fill="url(#rose)"/>
  <rect width="${W}" height="${H}" fill="url(#mintGlow)"/>

  ${bokeh(232, 132, 96, 0.10)}
  ${bokeh(902, 68, 70, 0.09)}
  ${bokeh(1376, 258, 108, 0.10, '#ffc4de')}
  ${bokeh(628, 438, 84, 0.08, '#a9ecd2')}

  ${sparkle(744, 92, 13, 0.5)}
  ${sparkle(876, 178, 7.5, 0.34)}
  ${sparkle(1336, 100, 10, 0.4)}
  ${sparkle(636, 236, 6.5, 0.28)}
  ${sparkle(1222, 376, 8.5, 0.3)}

  <ellipse cx="${TEXT_X + 300}" cy="248" rx="560" ry="250" fill="url(#scrim)"/>

  <!-- She stands on light, not on a drawn floor. -->
  <ellipse cx="${CAT_X}" cy="246" rx="248" ry="212" fill="url(#halo)"/>
  <ellipse cx="${CAT_X}" cy="468" rx="330" ry="118" fill="url(#stage)"/>

  <g filter="url(#cast)">
    <g transform="translate(${CAT_X} 470) scale(1.06) translate(${-FULL_C.x} -360)">
${art(FULL, 'b')}
    </g>
  </g>

  <g transform="translate(${TEXT_X} 0)">
    ${chip(0, 76, 'Plays in your browser')}

    <g filter="url(#lift)">
      <text x="0" y="214" font-family="Fredoka, system-ui, sans-serif" font-size="126"
            font-weight="700" letter-spacing="-4" fill="url(#word)">Biskit</text>
    </g>
    <text x="4" y="260" font-family="Fredoka, system-ui, sans-serif" font-size="30"
          font-weight="500" fill="#d7c6f2">A small cat who actually misses you</text>

    <g transform="translate(4 292)" filter="url(#lift)">
      <rect width="322" height="56" rx="28" fill="url(#cta)"/>
      <text x="161" y="37" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif"
            font-size="27" font-weight="600" fill="#0f3626">Play free at biskit.fun</text>
    </g>

    ${chipRow(4, 376, ['Voice mimic', 'Offline progress', 'Daily tasks'])}
  </g>

  <rect width="${W}" height="${H}" fill="url(#edge)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".055" style="mix-blend-mode:overlay"/>
</svg>
`,
);

console.log('wrote logo-mark, logo-lockup, logo-lockup-dark, x-avatar, x-banner');

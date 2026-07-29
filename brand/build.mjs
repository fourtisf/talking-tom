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
 * @param size    canvas edge
 * @param radius  corner radius; half the size gives a circle
 * @param tag     gradient namespace
 * @param safe    how far out of `size / 2` the ear tips may reach
 */
function mark(size, radius, tag, safe) {
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
    <clipPath id="clip-${tag}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}"/>
    </clipPath>
  </defs>

  <g clip-path="url(#clip-${tag})">
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
  <!-- App icon, 1024. Squircle-ish corners at 22% so it reads on iOS and
       Android alike. Generated by brand/build.mjs — do not edit by hand. -->
${mark(1024, 232, 'm', 404)}
</svg>
`,
);

writeFileSync(
  'brand/x-avatar.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <title>Biskit</title>
  <!-- X profile picture. X crops to a CIRCLE and renders it as small as 48px,
       so: head only, no text, and the ear tips kept well inside the crop.
       Generated by brand/build.mjs — do not edit by hand. -->
${mark(400, 200, 'a', 158)}
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
const FLOOR = 366;
/**
 * X's own profile disc covers roughly x 90..330 / y 330..500, and a narrow
 * window keeps only the middle 60% (x 300..1200). Everything that matters sits
 * inside that band and clear of that disc.
 */
const CAT_X = 1058;
const TEXT_X = 366;

const boards = Array.from({ length: 10 }, (_, i) => {
  const x = 60 + i * 168;
  return `M${x} ${FLOOR} ${x - 62} ${H}`;
}).join('');

writeFileSync(
  'brand/x-banner.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title>Biskit — a small cat who actually misses you</title>
  <!-- X header, 1500x500. Generated by brand/build.mjs — do not edit by hand.
       Safe zones are documented in brand/README.md and checked by the
       compositing preview, not assumed. -->
  <defs>
    ${catDefs('b')}
    ${depthDefs}
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d3c1f2"/>
      <stop offset="55%" stop-color="#b096e0"/>
      <stop offset="100%" stop-color="#8d71c6"/>
    </linearGradient>
    <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f2d9b6"/>
      <stop offset="100%" stop-color="#cfa87b"/>
    </linearGradient>
    <radialGradient id="pool" cx="50%" cy="0%" r="76%">
      <stop offset="0%" stop-color="#fff6e2" stop-opacity=".42"/>
      <stop offset="100%" stop-color="#fff6e2" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ray" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".16"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2b2040" stop-opacity=".46"/>
      <stop offset="15%" stop-color="#2b2040" stop-opacity="0"/>
      <stop offset="85%" stop-color="#2b2040" stop-opacity="0"/>
      <stop offset="100%" stop-color="#2b2040" stop-opacity=".46"/>
    </linearGradient>
    <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2b2040" stop-opacity="0"/>
      <stop offset="100%" stop-color="#2b2040" stop-opacity=".22"/>
    </linearGradient>
    <linearGradient id="word" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e6d9fb"/>
    </linearGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a5ecd1"/>
      <stop offset="100%" stop-color="#7fd9b8"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <ellipse cx="${W / 2}" cy="-70" rx="1000" ry="380" fill="url(#pool)"/>
  <!-- A light shaft from the window, so the room has a direction. -->
  <path d="M150 -40 L520 -40 L300 ${FLOOR} L60 ${FLOOR}Z" fill="url(#ray)"/>

  ${sparkle(700, 92, 13, 0.5)}
  ${sparkle(838, 168, 8, 0.38)}
  ${sparkle(1290, 118, 11, 0.42)}
  ${sparkle(596, 214, 7, 0.3)}

  <!-- The room's window, hard left and high: below y 330 X's avatar disc takes
       over, and the wordmark owns the middle. -->
  <g transform="translate(158 148) scale(1.2)" filter="url(#castSm)">
    <rect x="-79" y="-63" width="158" height="126" rx="16" fill="#bfe6f7"/>
    <rect x="-79" y="-63" width="158" height="63" rx="16" fill="#8fd0ee"/>
    <circle cx="34" cy="-34" r="19" fill="#ffd46b"/>
    <path d="M-79 30q40-26 79 0t79 0v33H-79z" fill="#7fd9b8"/>
    <rect x="-79" y="-63" width="158" height="126" rx="16" fill="none" stroke="#2e2340" stroke-width="7"/>
    <path d="M0-63V63M-79 0H79" stroke="#2e2340" stroke-width="7"/>
  </g>

  <rect y="${FLOOR}" width="${W}" height="${H - FLOOR}" fill="url(#floorG)"/>
  <rect y="${FLOOR - 14}" width="${W}" height="14" fill="#fffbf7"/>
  <rect y="${FLOOR - 4}" width="${W}" height="6" fill="#7a6494" opacity=".5"/>
  <g stroke="#7a6494" stroke-opacity=".13" stroke-width="4"><path d="${boards}"/></g>
  <rect y="${FLOOR}" width="${W}" height="${H - FLOOR}" fill="url(#floorFade)"/>

  <ellipse cx="${CAT_X}" cy="454" rx="186" ry="41" fill="#ffc2d8"/>
  <ellipse cx="${CAT_X}" cy="454" rx="170" ry="30" fill="none" stroke="#ffa8c6" stroke-width="9"/>
  <ellipse cx="${CAT_X}" cy="458" rx="142" ry="28" fill="url(#lift)"/>

  <g filter="url(#cast)">
    <g transform="translate(${CAT_X} 468) scale(1.04) translate(${-FULL_C.x} -360)">
${art(FULL, 'b')}
    </g>
  </g>

  <g transform="translate(${TEXT_X} 188)">
    <text x="0" y="0" font-family="Fredoka, system-ui, sans-serif" font-size="128"
          font-weight="700" letter-spacing="-4" fill="url(#word)">Biskit</text>
    <text x="4" y="60" font-family="Fredoka, system-ui, sans-serif" font-size="32"
          font-weight="500" fill="#f2e9ff" opacity=".94">A small cat who actually misses you</text>
    <g transform="translate(4 96)">
      <rect y="4" width="330" height="56" rx="28" fill="#3f8f70" opacity=".55"/>
      <rect width="330" height="56" rx="28" fill="url(#cta)"/>
      <text x="165" y="37" text-anchor="middle" font-family="Fredoka, system-ui, sans-serif"
            font-size="27" font-weight="600" fill="#14331f">Play free at biskit.fun</text>
    </g>
  </g>

  <rect width="${W}" height="${H}" fill="url(#edge)"/>
</svg>
`,
);

console.log('wrote logo-mark, logo-lockup, logo-lockup-dark, x-avatar, x-banner');

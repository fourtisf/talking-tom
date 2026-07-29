/**
 * Rasterise the brand SVGs to the exact pixel sizes X expects.
 *
 * Rendered in a real browser rather than by a converter, because the artwork
 * uses the same gradients and paths as the game and this way it is the same
 * renderer that draws them in play.
 *
 *   node brand/render.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

/**
 * Fredoka is the typeface the game's design calls for, and it is not installed
 * on most machines — including CI. Left to a font stack the wordmark silently
 * bakes in whatever generic sans happens to be around, which is exactly the
 * difference between a brand asset and a screenshot of one. Inlined as base64
 * so the render depends on no network and no system font.
 *
 * SIL Open Font License 1.1 — see brand/OFL-Fredoka.txt. Redistribution is
 * permitted; the licence travels with the file.
 */
const FREDOKA = readFileSync('brand/fredoka.woff2').toString('base64');
const FONT_CSS = `@font-face{font-family:'Fredoka';font-weight:400 700;font-display:block;` +
  `src:url(data:font/woff2;base64,${FREDOKA}) format('woff2')}`;

const JOBS = [
  { svg: 'brand/logo-mark.svg', out: 'brand/logo-mark.png', w: 1024, h: 1024 },
  { svg: 'brand/logo-lockup.svg', out: 'brand/logo-lockup.png', w: 1200, h: 340, alpha: true },
  { svg: 'brand/logo-lockup-dark.svg', out: 'brand/logo-lockup-dark.png', w: 1200, h: 340, alpha: true },
  { svg: 'brand/x-avatar.svg', out: 'brand/x-avatar.png', w: 400, h: 400 },
  { svg: 'brand/x-banner.svg', out: 'brand/x-banner.png', w: 1500, h: 500 },
];

const browser = await chromium.launch();
for (const job of JOBS) {
  let source;
  try {
    source = readFileSync(job.svg, 'utf8');
  } catch {
    console.log(`skip ${job.svg} (not present)`);
    continue;
  }
  // Rasterise at twice the target, then downsample to it. The comment here
  // used to claim exactly this while the code did only the first half — so
  // every PNG shipped at 2x its documented size, and x-banner.png went out at
  // 3000x1000 and 2.85MB against X's 2MB header limit. An asset nobody can
  // upload is not an asset.
  const page = await browser.newPage({
    viewport: { width: job.w, height: job.h },
    deviceScaleFactor: 2,
  });
  await page.setContent(
    `<style>${FONT_CSS}html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${source}`,
    { waitUntil: 'load' },
  );
  // Block until the face is actually usable, or the first paint uses the
  // fallback and that is what gets captured.
  await page.evaluate(() => document.fonts.load("700 100px Fredoka").then(() => document.fonts.ready));
  await page.waitForTimeout(150);
  const buf = await page.screenshot({
    clip: { x: 0, y: 0, width: job.w, height: job.h },
    // The lockup is meant to sit on someone else's background, so it keeps its
    // alpha; everything else is opaque artwork and a transparent PNG of it just
    // invites a viewer to composite it onto white.
    omitBackground: job.alpha === true,
  });
  // The downsample the line above promises. Vector rasterised at 2x and
  // averaged down is measurably cleaner on the wordmark's curves than the same
  // vector rasterised once at 1x, which is why the supersample is kept rather
  // than simply dropping deviceScaleFactor to 1.
  const scaled = await page.evaluate(
    async ({ b64, width, height, alpha }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (!alpha) {
        // Flatten onto white BEFORE scaling: a transparent edge pixel averaged
        // with its neighbours otherwise leaves a dark halo once a viewer
        // composites it.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { b64: buf.toString('base64'), width: job.w, height: job.h, alpha: job.alpha === true },
  );

  const out = Buffer.from(scaled, 'base64');
  writeFileSync(job.out, out);
  console.log(`${job.out}  ${job.w}x${job.h}  ${(out.length / 1024).toFixed(0)} KB`);
  await page.close();
}
await browser.close();

/**
 * Clean pictures of Biskit, taken with the game's OWN camera.
 *
 *   npm run dev -- --port 8105     # in another shell
 *   node brand/shots.mjs           # from the repo root
 *
 * Not a screenshot: the photo feature already hides the HUD, the rail and the
 * speech bubble for exactly this reason, so tapping it and intercepting the
 * canvas gives a chrome-free 840x1050 card through the shipped code path. The
 * caption band is the bottom 112px and the composer crops it.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = (over) => ({
  version: 1, stats: { hunger: 78, energy: 82, fun: 80, clean: 92 },
  coins: 900, gems: 12, level: 6, xp: 20,
  ownedItems: [], equipped: { hat: null, outfit: null, decor: null },
  isSleeping: false, lastSeenUtc: Date.now(), sleepStartedUtc: null,
  adWatchesToday: 0, adDayKey: '', totalPlaySeconds: 600,
  dailyLoginDayKey: '9999-12-31', dailyLoginStreak: 3,
  notificationsSentToday: 0, notificationDayKey: '', photoDayKey: '9999-12-31',
  lifetime: {}, awardsClaimed: [],
  muted: true, musicMuted: true, playerName: 'Alfa', petName: 'Biskit', rev: 3,
  taskDayKey: '9999-12-31', taskIds: [], taskCounts: {}, taskClaimed: [],
  tutorialStep: -1, relief: 92, messRoom: null, ...over,
});

/** name -> [nav tab index, equipped, extra save fields] */
const SHOTS = {
  hero:      [0, { hat: null, outfit: null, decor: null }],
  kitchen:   [1, { hat: null, outfit: 'tee', decor: null }],
  bath:      [2, { hat: null, outfit: null, decor: null }],
  bed:       [3, { hat: null, outfit: null, decor: null }, { isSleeping: true }],
  loo:       [4, { hat: null, outfit: 'dungarees', decor: null }],
  dungarees: [0, { hat: 'beanie', outfit: 'dungarees', decor: 'rug.tide' }],
  tutu:      [0, { hat: 'bloom', outfit: 'tutu', decor: 'rug.blush' }],
  hoodie:    [0, { hat: 'cans', outfit: 'hoodie', decor: 'rug.moss' }],
  astro:     [0, { hat: 'astro', outfit: 'space', decor: 'rug.stars' }],
  crown:     [0, { hat: 'crown', outfit: 'raincoat', decor: 'rug.sun' }],
  wizard:    [0, { hat: 'wizard', outfit: 'hoodie', decor: 'rug.stripe' }],
  // The gem rack, and ONLY gem-priced pieces: halo/wizard/astro/rainbow are
  // the four gem hats, tutu and space the two gem outfits. The crown is 600
  // COINS, so it cannot appear on a banner whose whole claim is "not for sale".
  // The gem rack, one tile per item, so each can carry its own real price.
  gemHalo:    [0, { hat: 'halo', outfit: null, decor: 'rug.sun' }],
  gemTutu:    [0, { hat: null, outfit: 'tutu', decor: 'rug.blush' }],
  gemWizard:  [0, { hat: 'wizard', outfit: null, decor: 'rug.stripe' }],
  gemAstro:   [0, { hat: 'astro', outfit: null, decor: 'rug.tide' }],
  gemSpace:   [0, { hat: null, outfit: 'space', decor: 'rug.stars' }],
  gemRainbow: [0, { hat: 'rainbow', outfit: null, decor: 'rug.moss' }],
};

const browser = await chromium.launch();
const out = {};
for (const [name, [tab, equipped, extra = {}]] of Object.entries(SHOTS)) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', name, e.message));
  await page.addInitScript((d) => {
    localStorage.setItem('CapacitorStorage.biskit.save.v1', d);
    localStorage.setItem('CapacitorStorage.biskit.analytics.funnel.v1', '{}');
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      if (this.width === 840) window.__card = this.toDataURL('image/png');
      return orig.call(this, cb, type, q);
    };
    Object.defineProperty(navigator, 'canShare', { value: () => false });
  }, JSON.stringify(base({ equipped, ownedItems: Object.values(equipped).filter(Boolean), ...extra })));
  await page.goto('http://localhost:8105/play', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const g = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
    return { cw: c.width, ch: c.height, left: r.left, top: r.top, w: r.width, h: r.height };
  });
  const P = (x, y) => ({ x: g.left + (x * g.w) / g.cw, y: g.top + (y * g.h) / g.ch });
  const uiW = Math.min(g.cw, 600), uiL = Math.round((g.cw - uiW) / 2);
  const inner = uiW - 28, gap = 3, tabW = (inner - gap * 6) / 7;

  if (tab !== 0) {
    await page.mouse.click(...Object.values(P(uiL + 14 + tab * (tabW + gap) + tabW / 2, 628 + 172 + 28)));
    await page.waitForTimeout(1500);
  }
  // The camera: rail slot 3, origin y 296, centre +26.
  await page.mouse.click(...Object.values(P(uiL + uiW - 66 + 26, 296 + 26)));
  await page.waitForTimeout(2000);
  const card = await page.evaluate(() => window.__card ?? null);
  if (!card) { console.log('NO CARD:', name); } else { out[name] = card; console.log('ok', name); }
  await page.close();
}
writeFileSync('brand/shots.json', JSON.stringify(out));
await browser.close();

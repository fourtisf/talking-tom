import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import { renameSync, existsSync } from 'node:fs';
// `vitest/config` re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig, type Plugin } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

const page = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

/**
 * The native app opens `index.html` and has no use for a marketing page, so the
 * `app` build emits the game there instead. Rollup names its output after the
 * input, so the file is renamed once the bundle is written.
 */
function gameAsIndex(outDir: string): Plugin {
  return {
    name: 'biskit-game-as-index',
    closeBundle() {
      const from = `${outDir}/play.html`;
      if (existsSync(from)) renameSync(from, `${outDir}/index.html`);
    },
  };
}

/**
 * Production serves the game at `/play`, and nginx maps that onto play.html, so
 * the extension never reaches the URL bar and a refresh on `/play` re-serves the
 * game rather than falling through to the landing page.
 *
 * Dev and preview have to speak the same URLs or the extensionless route is only
 * ever exercised in production. Vite's html fallback already resolves `/play` to
 * `play.html` by itself; what is missing is the canonical redirects, without
 * which `/play.html` keeps working locally and the extension leaks back out
 * through bookmarks and bug reports.
 *
 * ORDERING IS LOAD-BEARING. `use()` is called synchronously in the hook body on
 * purpose: Vite runs configureServer/configurePreviewServer BEFORE installing
 * its own stack, so a middleware registered here sits ahead of the static
 * handler and the html fallback. Returning a function from the hook defers
 * registration until after them, and then htmlFallback rewrites `/` to
 * `/index.html` in place, this middleware 301s it back, and both `/` and `/play`
 * become infinite redirect loops. Do not "tidy" this into a returned closure.
 */
function prettyUrls(): Plugin {
  /** Extensionless route -> the file behind it. Mirrors the nginx try_files. */
  const routes = new Map([['/play', '/play.html']]);

  /** Reachable but not canonical, and where each belongs. */
  const canonical = new Map([
    ['/play.html', '/play'],
    ['/index.html', '/'],
    // `base: './'` makes asset hrefs relative, and a trailing slash moves the
    // directory they resolve against: `/play/` would fetch `/play/assets/…`.
    // Normalise it away rather than serve a page whose scripts all 404.
    ['/play/', '/play'],
  ]);

  /** Vite's own endpoints: HMR client, module graph, fs escape hatch, deps. */
  const viteInternal = /^\/(?:@|src\/|node_modules\/|\.vite\/|__)/;

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const url = req.url;
    if (!url || viteInternal.test(url)) return next();

    const queryAt = url.indexOf('?');
    const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
    const search = queryAt === -1 ? '' : url.slice(queryAt);

    const target = canonical.get(pathname);
    if (target !== undefined) {
      res.statusCode = 301;
      res.setHeader('Location', target + search);
      // nginx answers 301 too, so the status matches production. But browsers
      // cache a 301 near-permanently, and that would outlive the next edit to
      // these tables — so locally, do not let them.
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    // An internal rewrite, not a redirect: the URL bar still reads `/play`.
    const file = routes.get(pathname);
    if (file !== undefined) req.url = file + search;

    next();
  };

  return {
    name: 'biskit-pretty-urls',
    // Serve-only, so neither `vite build` nor `--mode app` ever sees it.
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  // `vite build --mode app` -> Capacitor bundle: the game only, at index.html.
  // `vite build`            -> web: landing at /, game at /play (nginx maps
  //                            /play onto play.html; /play.html 301s to it).
  const isApp = mode === 'app';
  const outDir = 'dist';

  return {
    base: './',
    // Surfaced in the settings sheet, so a bug report can name a build.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // The app bundle has no landing page and no server, so pretty URLs are
    // meaningless there — `gameAsIndex` already puts the game at the root.
    plugins: isApp ? [gameAsIndex(outDir)] : [prettyUrls()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir,
      // Capacitor serves from the filesystem; keep assets relative and chunks few.
      target: 'es2022',
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        // The landing page ships no game code: Phaser is ~330KB gzipped and
        // nobody should pay for it before they tap Play.
        input: isApp ? { play: page('play.html') } : { main: page('index.html'), play: page('play.html') },
        output: {
          manualChunks: {
            phaser: ['phaser'],
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      reporters: ['default'],
    },
  };
});

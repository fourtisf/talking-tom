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

export default defineConfig(({ mode }) => {
  // `vite build --mode app` -> Capacitor bundle: the game only, at index.html.
  // `vite build`            -> web: landing page at index.html, game at play.html.
  const isApp = mode === 'app';
  const outDir = 'dist';

  return {
    base: './',
    // Surfaced in the settings sheet, so a bug report can name a build.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: isApp ? [gameAsIndex(outDir)] : [],
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

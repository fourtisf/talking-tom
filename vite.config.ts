import { fileURLToPath, URL } from 'node:url';
// `vitest/config` re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  // Surfaced in the settings sheet, so a bug report can name a build.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Capacitor serves from the filesystem; keep assets relative and chunks few.
    target: 'es2022',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
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
});

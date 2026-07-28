/**
 * Phaser boot, scale config, scene registry.
 *
 * The game is laid out against a fixed 420x860 design space and letterboxed to
 * fit whatever the device gives us, so no scene has to do responsive maths.
 */

import Phaser from 'phaser';

import { BACKDROP } from '@/config/palette';
import { GameContext } from '@/core/GameContext';
import { BootScene } from '@/scenes/BootScene';
import { HomeScene } from '@/scenes/HomeScene';
import { MiniGameScene } from '@/scenes/MiniGameScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { ShopScene } from '@/scenes/ShopScene';
import { DESIGN } from '@/ui/theme';

/** True inside the Capacitor webview, false in a desktop browser. */
async function detectNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Persist and schedule notifications when the OS backgrounds the app. */
async function bindAppLifecycle(context: GameContext): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        context.onResume();
      } else {
        void context.onPause();
      }
    });
  } catch {
    // Browser fallback: the page visibility API covers the same two moments.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void context.onPause();
      else context.onResume();
    });
  }
}

async function start(): Promise<void> {
  const isNative = await detectNative();
  const context = new GameContext({ isNative });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: BACKDROP,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: DESIGN.width,
      height: DESIGN.height,
    },
    // No physics: everything moves on tweens, which is cheaper and enough.
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [BootScene, PreloadScene, HomeScene, MiniGameScene, ShopScene],
  });

  GameContext.install(game, context);
  await bindAppLifecycle(context);

  if (isNative) {
    // Ask once, on the first run. A refusal is fine — §14 just goes quiet.
    void context.notifications.requestPermission();
  }
}

void start();

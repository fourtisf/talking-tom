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
import { CopycatScene } from '@/scenes/CopycatScene';
import { HomeScene } from '@/scenes/HomeScene';
import { MiniGameScene } from '@/scenes/MiniGameScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { TasksScene } from '@/scenes/TasksScene';
import { TutorialScene } from '@/scenes/TutorialScene';
import { ShopScene } from '@/scenes/ShopScene';
import { designSizeFor } from '@/ui/theme';

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

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: BACKDROP,
    scale: {
      mode: Phaser.Scale.FIT,
      // Phaser owns the centring, and the page must not also do it — two
      // centring systems stack their offsets and the game ends up half the
      // leftover width off to one side. `#app` is a plain block for this reason.
      autoCenter: Phaser.Scale.CENTER_BOTH,
      // Portrait keeps the 420-wide design untouched; a landscape window gets a
      // canvas as wide as its aspect asks for, so the room fills the screen
      // rather than sitting in a strip. Height is fixed, so FIT still fills
      // vertically. Measured once at boot — a mid-session resize keeps the size
      // it started with, exactly as before this change.
      ...designSizeFor(window.innerWidth, window.innerHeight),
    },
    // No physics: everything moves on tweens, which is cheaper and enough.
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    fps: { target: 60, forceSetTimeOut: false },
    scene: [
      BootScene,
      PreloadScene,
      HomeScene,
      MiniGameScene,
      CopycatScene,
      ShopScene,
      SettingsScene,
      TasksScene,
      TutorialScene,
    ],
    callbacks: {
      // Runs before any scene boots, so BootScene can never look up a context
      // that has not been installed yet.
      preBoot: (booting) => GameContext.install(booting, context),
    },
  });

  await bindAppLifecycle(context);

  if (isNative) {
    // Ask once, on the first run. A refusal is fine — §14 just goes quiet.
    void context.notifications.requestPermission();
  }
}

void start();

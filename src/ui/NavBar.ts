/**
 * Bottom room tabs. Each carries a "needs you" dot driven by the stat that
 * room fixes, so the player is told where to go rather than left to guess.
 */

import Phaser from 'phaser';

import { t, type MessageKey } from '@/i18n';

import { PALETTE } from '@/config/palette';
import type { RoomKey } from '@/core/types';
import { SUPERSAMPLE } from '@/ui/bake';
import { drawIcon, type IconName } from '@/ui/icons';
import { FONT_BODY, RADIUS } from '@/ui/theme';

export interface TabDef {
  key: RoomKey;
  /** A message key from `src/i18n`, not a word. */
  label: MessageKey;
  icon: IconName;
}

/**
 * `label` is a message KEY, not a word. Resolved when the tab is drawn rather
 * than when this module is evaluated — a module-level `t()` would bake in
 * whatever locale happened to be current at import time, which is before the
 * stored preference has been read off disk.
 */
export const TABS: readonly TabDef[] = [
  { key: 'home', label: 'nav.home', icon: 'home' },
  { key: 'kitchen', label: 'nav.kitchen', icon: 'food' },
  { key: 'bath', label: 'nav.bath', icon: 'bath' },
  { key: 'bed', label: 'nav.bed', icon: 'moon' },
  { key: 'play', label: 'nav.play', icon: 'game' },
];

interface Tab {
  def: TabDef;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  iconOn: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  dot: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Rectangle;
}

export class NavBar extends Phaser.GameObjects.Container {
  private readonly tabs: Tab[] = [];
  private activeKey: RoomKey = 'home';
  private readonly onSelect: (key: RoomKey) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    onSelect: (key: RoomKey) => void,
  ) {
    super(scene, x, y);
    this.onSelect = onSelect;

    const gap = 4;
    const tabWidth = (width - gap * (TABS.length - 1)) / TABS.length;
    const tabHeight = 54;

    TABS.forEach((def, i) => {
      const tx = i * (tabWidth + gap);
      const container = scene.add.container(tx, 0);

      const background = scene.add.graphics();
      container.add(background);

      // Two icon copies: white for the inactive state, purple for the active
      // one. Swapping visibility is cheaper than redrawing on every tap.
      const icon = drawIcon(scene, def.icon, 25, PALETTE.white, 2.1);
      icon.setPosition(tabWidth / 2, 18);
      container.add(icon);

      const iconOn = drawIcon(scene, def.icon, 25, 0x6b54a0, 2.1);
      iconOn.setPosition(tabWidth / 2, 18);
      iconOn.setVisible(false);
      container.add(iconOn);

      const label = scene.add
        .text(tabWidth / 2, 40, t(def.label), {
          fontFamily: FONT_BODY,
          fontSize: '9.5px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      container.add(label);

      const dot = scene.add.container(tabWidth / 2 + 20, 4);
      const dotG = scene.add.graphics();
      dotG.fillStyle(0xff5b7f, 1);
      dotG.fillCircle(0, 0, 6);
      dotG.lineStyle(2.5, PALETTE.white, 1);
      dotG.strokeCircle(0, 0, 6);
      dot.add(dotG);
      dot.setVisible(false);
      container.add(dot);

      const hit = scene.add
        .rectangle(tabWidth / 2, tabHeight / 2, tabWidth, tabHeight, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onSelect(def.key));
      container.add(hit);

      this.add(container);
      this.tabs.push({ def, container, background, icon, iconOn, label, dot, hit });
    });

    this.selectRoom('home');
    scene.add.existing(this);
  }

  /** Named `selectRoom`, not `setActive` — GameObject already owns that name. */
  selectRoom(key: RoomKey): void {
    this.activeKey = key;
    for (const tab of this.tabs) {
      const on = tab.def.key === key;
      const width = tab.hit.width;
      tab.background.clear();
      if (on) {
        tab.background.fillStyle(PALETTE.white, 1);
        tab.background.fillRoundedRect(0, 0, width, 54, RADIUS.card);
      }
      tab.icon.setVisible(!on);
      tab.iconOn.setVisible(on);
      tab.label.setColor(on ? '#6b54a0' : '#ffffff');

      this.scene.tweens.killTweensOf([tab.icon, tab.iconOn]);
      const target = on ? tab.iconOn : tab.icon;
      const restScale = 1 / SUPERSAMPLE;
      this.scene.tweens.add({
        targets: target,
        y: on ? 15 : 18,
        scale: on ? restScale * 1.14 : restScale,
        duration: 240,
        ease: 'Back.easeOut',
      });
    }
  }

  get activeRoom(): RoomKey {
    return this.activeKey;
  }

  /** Show the attention dot on the tab whose room fixes this stat. */
  setDot(key: RoomKey, on: boolean): void {
    const tab = this.tabs.find((t) => t.def.key === key);
    if (!tab) return;
    if (tab.dot.visible === on) return;
    tab.dot.setVisible(on);
    if (!on) {
      this.scene.tweens.killTweensOf(tab.dot);
      tab.dot.setScale(1);
      return;
    }
    this.scene.tweens.add({
      targets: tab.dot,
      scale: 1.25,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  setInputEnabled(enabled: boolean): void {
    for (const tab of this.tabs) {
      if (enabled) tab.hit.setInteractive({ useHandCursor: true });
      else tab.hit.disableInteractive();
    }
  }
}

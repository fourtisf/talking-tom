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

/** `label` is a catalogue KEY, not a word; resolved when the tab is drawn. */
export const TABS: readonly TabDef[] = [
  { key: 'home', label: 'nav.home', icon: 'home' },
  { key: 'kitchen', label: 'nav.kitchen', icon: 'food' },
  { key: 'bath', label: 'nav.bath', icon: 'bath' },
  { key: 'bed', label: 'nav.bed', icon: 'moon' },
  { key: 'loo', label: 'nav.loo', icon: 'loo' },
  /*
   * STYLE opens the wardrobe; it is not a room.
   *
   * It is here because the owner asked where the clothes were three separate
   * times, and each time the answer was "behind the hat button on the right
   * rail, second tab". A feature nobody can find is a feature nobody has. The
   * rail button stays — this is a second door to the same sheet, opened on the
   * outfits rack rather than the hats one.
   */
  { key: 'style', label: 'nav.style', icon: 'shirt' },
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

    /*
     * SEVEN tabs. The note here used to say seven would not fit, and it was
     * right about the cost and wrong about the verdict, so here is the cost.
     *
     * The canvas is 420x860 and Scale.FIT shrinks the whole thing to
     * min(vw/420, vh/860), so a tab's real size in CSS pixels depends on the
     * screen's HEIGHT as much as its width. Measured, with the 44px enhanced
     * target-size floor from the HIG and WCAG 2.2 as the line:
     *
     *     device              6 tabs      7 tabs
     *     iPhone SE1 320x568  40.9x35.7   35.3x37.6   both under
     *     iPhone SE2 375x667  48.1x41.9   41.4x44.2   newly under
     *     Android    360x640  46.1x40.2   39.8x42.4   newly under
     *     Galaxy A   360x740  53.1x46.3   45.8x48.9
     *     iPhone 14  390x844  57.6x50.1   49.6x52.9
     *     Pro Max    430x932  63.5x55.3   54.7x58.4
     *
     * So it costs two device classes their width margin, and 4:3-ish phones
     * were already failing on height before this. There is no arithmetic that
     * avoids it: seven 44px targets need 308 CSS px, which on a 375x667 screen
     * is 397 of the 420 canvas units available, leaving 23 for six gaps and
     * two margins. Zero gap and zero padding is not a bar, it is a stripe.
     *
     * Taken anyway, with the height raised to 57 so those same phones gain
     * back vertically what they lose horizontally — 41x44 instead of 48x42,
     * near enough the same area — because a feature the owner could not find
     * in three tries costs more than 6px of thumb.
     *
     * The part that genuinely did not fit was the "needs you" dot. It sat at
     * a hardcoded `tabWidth / 2 + 20`, and with r6 and a 2.5 stroke its right
     * edge lands 27.25 out from the middle — inside a 62px tab, 1.5px outside
     * a 53px one, so it would have leaked into the neighbour. It is clamped to
     * the tab now rather than trusting a constant measured against a layout
     * that has since changed twice.
     */
    const gap = 3;
    const tabWidth = (width - gap * (TABS.length - 1)) / TABS.length;
    /*
     * 57, up from 54. The dock gives the bar 60px between `top + 172` and its
     * own bottom edge, and three of those were going spare. A seventh tab
     * costs touch-target WIDTH that no amount of arithmetic can give back on a
     * small screen (see above), so the height it can give back, it gives.
     */
    const tabHeight = 57;
    const DOT_EDGE = 8.5;
    const dotX = Math.min(tabWidth / 2 + 20, tabWidth - DOT_EDGE);

    TABS.forEach((def, i) => {
      const tx = i * (tabWidth + gap);
      const container = scene.add.container(tx, 0);

      const background = scene.add.graphics();
      // The face is redrawn on every selection, and `selectRoom` has no view
      // of `tabHeight` — it reads it off the hit rectangle, which is the one
      // object that already knows both dimensions.
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

      const dot = scene.add.container(dotX, 4);
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
        tab.background.fillRoundedRect(0, 0, width, tab.hit.height, RADIUS.card);
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

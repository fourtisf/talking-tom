/**
 * Wardrobe. Spec §9 — an overlay sheet, not a room, so it runs *over* HomeScene
 * and the pet keeps breathing behind it.
 *
 * Buying and equipping both go through here, and every coin movement goes
 * through `Economy` (§7). This scene never touches `coins`.
 *
 * TWO RACKS, ONE SHEET. Hats and outfits are separate slots — she wears one of
 * each — so they cannot share a grid without the "tap again to take it off"
 * rule becoming ambiguous. They get a tab each instead of a second scene: the
 * sheet, the coin packs and the buy path are identical, and a `ShopScene` and
 * an almost-identical `WardrobeScene` would drift apart within a week.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { HATS, OUTFITS, type WearSlot, type WearableDef } from '@/config/tuning';
import { GameContext } from '@/core/GameContext';
import { Iap, type CoinPack } from '@/services/Iap';
import { BUTTON_HEIGHT, Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { drawIcon } from '@/ui/icons';
import { FONT_BODY, FONT_DISPLAY, RADIUS } from '@/ui/theme';
import { placeholderPetArt } from '@/pet/PetArt';
import { SCENE } from '@/scenes/keys';
import { t } from '@/i18n';
import { wearableName } from '@/i18n/content';

const COLUMNS = 3;
/**
 * 96, not the 104 it was.
 *
 * The panel is capped at a fraction of the screen and simply CLIPS whatever
 * runs past it — there is no scrolling. At four rows of hats plus the coin
 * packs the Close button was already falling off the bottom before the outfits
 * tab existed, and the tab row would have pushed another 46px off. Eight pixels
 * a row, times four rows, is what buys it back.
 */
const CARD_HEIGHT = 96;
const PACK_HEIGHT = 92;
const TAB_HEIGHT = 34;

const TABS: readonly { slot: WearSlot; label: () => string; rack: readonly WearableDef[] }[] = [
  { slot: 'hat', label: () => t('shop.tab.hats'), rack: HATS },
  { slot: 'outfit', label: () => t('shop.tab.outfits'), rack: OUTFITS },
];

export class ShopScene extends Phaser.Scene {
  private context!: GameContext;
  private sheet!: Sheet;
  private grid!: Phaser.GameObjects.Container;
  private toast!: Toast;
  private busy = false;
  /**
   * Which rack is showing.
   *
   * Reset in `create()`, not here: Phaser reuses the scene INSTANCE across
   * stop/start, so a field initialiser runs once per game lifetime and the
   * wardrobe would reopen on whatever tab it was left on three sessions ago.
   */
  private tab: WearSlot = 'hat';

  constructor() {
    super(SCENE.shop);
  }

  create(): void {
    this.context = GameContext.from(this);
    const { width, height } = this.scale.gameSize;

    this.sheet = new Sheet(this, width, height, {
      title: t('shop.title'),
      subtitle: t('shop.subtitle'),
      // Nearly full height. The rack, the coin packs and the Close button have
      // to be reachable in one view for the reason above; a shorter sheet here
      // means a button nobody can press.
      maxHeightRatio: 0.9,
      onClose: () => {
        this.scene.get(SCENE.home).events.emit('shop-closed');
        this.scene.stop();
      },
    });

    this.busy = false;
    this.tab = 'hat';
    this.grid = this.add.container(0, 0);
    this.sheet.content.add(this.grid);

    this.toast = new Toast(this, width / 2, 128, width - 40);

    this.renderGrid();
    this.sheet.show();
  }

  private renderGrid(): void {
    this.grid.removeAll(true);

    // The panel, not the canvas: on a wide screen they differ.
    const width = this.sheet.panelWidth;
    const pad = 14;
    const gap = 9;
    const cardWidth = (width - pad * 2 - gap * (COLUMNS - 1)) / COLUMNS;

    this.grid.add(this.buildTabs(pad, 0, width - pad * 2));

    const rack = TABS.find((tab) => tab.slot === this.tab)?.rack ?? HATS;
    const top = TAB_HEIGHT + 12;
    rack.forEach((item, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const x = pad + col * (cardWidth + gap);
      const y = top + row * (CARD_HEIGHT + gap);
      this.grid.add(this.buildCard(item, x, y, cardWidth));
    });

    const rows = Math.ceil(rack.length / COLUMNS);
    let y = top + rows * (CARD_HEIGHT + gap);

    // Coin packs (§13). Shown once the level gate is passed, whether or not the
    // billing library is connected — a player who taps with no store gets told
    // why, rather than tapping a dead button or being shown nothing at all.
    if (this.context.iap.isUnlocked) {
      y += 6;
      this.grid.add(
        this.add
          .text(pad, y, t('shop.packs.heading'), {
            fontFamily: FONT_BODY,
            fontSize: '11px',
            color: '#5b486b',
            fontStyle: 'bold',
          })
          .setOrigin(0),
      );
      y += 22;

      this.context.iap.catalogue.forEach((pack, i) => {
        const x = pad + i * (cardWidth + gap);
        this.grid.add(this.buildPackCard(pack, x, y, cardWidth));
      });
      y += PACK_HEIGHT + gap;
    }

    const buttonY = y + 6;
    this.grid.add(
      new Button(this, pad, buttonY, t('common.close'), {
        width: width - pad * 2,
        tone: 'coral',
        onPress: () => this.sheet.close(),
      }),
    );

    this.sheet.fitToContent(buttonY + BUTTON_HEIGHT);
  }

  private buildPackCard(
    pack: CoinPack,
    x: number,
    y: number,
    cardWidth: number,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);

    const face = this.add.graphics();
    face.fillStyle(PALETTE.ink, 1);
    face.fillRoundedRect(0, 4, cardWidth, PACK_HEIGHT, RADIUS.card);
    face.fillStyle(PALETTE.white, 1);
    face.lineStyle(3, PALETTE.ink, 1);
    face.fillRoundedRect(0, 0, cardWidth, PACK_HEIGHT, RADIUS.card);
    face.strokeRoundedRect(0, 0, cardWidth, PACK_HEIGHT, RADIUS.card);
    card.add(face);

    const coin = drawIcon(this, 'coin', 26, PALETTE.butter);
    coin.setPosition(cardWidth / 2, 24);
    card.add(coin);

    card.add(
      this.add
        .text(cardWidth / 2, 48, pack.coins.toLocaleString('en-GB'), {
          fontFamily: FONT_DISPLAY,
          fontSize: '15px',
          color: '#33243f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    card.add(
      this.add
        .text(cardWidth / 2, 64, pack.name, {
          fontFamily: FONT_BODY,
          fontSize: '9px',
          color: '#5b486b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    card.add(
      this.add
        .text(cardWidth / 2, 79, pack.displayPrice, {
          fontFamily: FONT_DISPLAY,
          fontSize: '12px',
          color: '#8a5a00',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const hit = this.add
      .rectangle(cardWidth / 2, PACK_HEIGHT / 2, cardWidth, PACK_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => void this.buyPack(pack));
    card.add(hit);

    return card;
  }

  private async buyPack(pack: CoinPack): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.context.iap.buyCoinPack(pack.sku);
      const message = Iap.message(result);
      if (result.status === 'purchased') {
        this.context.audio.play('coin');
      } else if (message) {
        this.toast.show(message);
      }
      this.renderGrid();
    } finally {
      this.busy = false;
    }
  }

  /**
   * The rack switcher.
   *
   * Two pills rather than the `Button` used everywhere else: a button is a
   * thing you press to make something happen, and these say which of two views
   * you are looking at. Same reason the selected one is filled and the other is
   * an outline — a pair of identical buttons cannot answer "which am I on".
   */
  private buildTabs(x: number, y: number, width: number): Phaser.GameObjects.Container {
    const row = this.add.container(x, y);
    const gap = 8;
    const tabWidth = (width - gap * (TABS.length - 1)) / TABS.length;

    TABS.forEach((tab, i) => {
      const left = i * (tabWidth + gap);
      const on = tab.slot === this.tab;

      const face = this.add.graphics();
      face.fillStyle(on ? PALETTE.grape : PALETTE.white, 1);
      face.lineStyle(3, PALETTE.ink, 1);
      face.fillRoundedRect(left, 0, tabWidth, TAB_HEIGHT, TAB_HEIGHT / 2);
      face.strokeRoundedRect(left, 0, tabWidth, TAB_HEIGHT, TAB_HEIGHT / 2);
      row.add(face);

      row.add(
        this.add
          .text(left + tabWidth / 2, TAB_HEIGHT / 2, tab.label(), {
            fontFamily: FONT_DISPLAY,
            fontSize: '12.5px',
            color: on ? '#ffffff' : '#5b486b',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );

      if (on) return;
      const hit = this.add
        .rectangle(left + tabWidth / 2, TAB_HEIGHT / 2, tabWidth, TAB_HEIGHT, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        this.tab = tab.slot;
        this.renderGrid();
      });
      row.add(hit);
    });

    return row;
  }

  private buildCard(
    hat: WearableDef,
    x: number,
    y: number,
    cardWidth: number,
  ): Phaser.GameObjects.Container {
    const { state, progression } = this.context;
    const owned = state.owns(hat.id);
    const equipped = state.equipped[hat.slot] === hat.id;
    const unlocked = progression.isLevelReached(hat.unlockLevel);

    const card = this.add.container(x, y);

    const face = this.add.graphics();
    const fill = equipped ? PALETTE.grape : owned ? 0xdff7ec : PALETTE.white;
    face.fillStyle(PALETTE.ink, 1);
    face.fillRoundedRect(0, 4, cardWidth, CARD_HEIGHT, RADIUS.card);
    face.fillStyle(fill, 1);
    face.lineStyle(3, PALETTE.ink, 1);
    face.fillRoundedRect(0, 0, cardWidth, CARD_HEIGHT, RADIUS.card);
    face.strokeRoundedRect(0, 0, cardWidth, CARD_HEIGHT, RADIUS.card);
    card.add(face);

    // Art comes from the pet art provider, so a swapped art pack updates the
    // shop for free. Outfits are drawn against the torso rather than around a
    // head anchor, so they hang lower in their box and need nudging back up.
    const art =
      hat.slot === 'outfit'
        ? placeholderPetArt.createOutfit(this, hat.id)
        : placeholderPetArt.createAccessory(this, hat.id);
    if (art) {
      const holder = this.add.container(cardWidth / 2, hat.slot === 'outfit' ? 32 : 34);
      holder.add(art);
      holder.setScale(hat.slot === 'outfit' ? 0.38 : 0.26);
      card.add(holder);
    }

    const textColor = equipped ? '#ffffff' : '#5b486b';
    card.add(
      this.add
        .text(cardWidth / 2, 63, wearableName(hat.slot, hat.id, hat.name), {
          fontFamily: FONT_BODY,
          fontSize: '10px',
          color: textColor,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const caption = !unlocked
      ? t('shop.card.locked', { n: hat.unlockLevel })
      : equipped
        ? t('shop.card.wearing')
        : owned
          ? t('shop.card.tapToWear')
          : `${hat.price}`;

    // A bare number cannot say which pocket it comes out of, and the two are
    // not interchangeable: coins are earned by playing, gems only by levelling.
    // The price carries its own currency icon so nobody taps a gem hat
    // expecting to have paid for it out of a mini-game round.
    const priceIsCurrency = unlocked && !owned && !equipped;
    const label = this.add
      .text(cardWidth / 2, 81, caption, {
        fontFamily: FONT_DISPLAY,
        fontSize: '11.5px',
        color: equipped ? '#ffffff' : unlocked ? '#8a5a00' : '#a995c4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    card.add(label);

    if (priceIsCurrency) {
      const iconSize = 13;
      // Shift the number right by half the badge so the pair stays centred.
      label.setX(cardWidth / 2 + iconSize * 0.42);
      const badge = drawIcon(
        this,
        hat.currency === 'gems' ? 'gem' : 'coin',
        iconSize,
        hat.currency === 'gems' ? PALETTE.sky : PALETTE.butter,
        2,
      );
      badge.setPosition(label.x - label.width / 2 - iconSize * 0.62, 81);
      card.add(badge);
    }

    if (!unlocked) {
      card.setAlpha(0.45);
      return card;
    }

    const hit = this.add
      .rectangle(cardWidth / 2, CARD_HEIGHT / 2, cardWidth, CARD_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.onCardPressed(hat));
    card.add(hit);

    return card;
  }

  private onCardPressed(hat: WearableDef): void {
    const { state, economy, progression, audio } = this.context;

    if (!state.owns(hat.id)) {
      // Gems only ever come from levelling, so "earn some" is not advice a
      // player can act on this minute. Say what actually produces them.
      const paid =
        hat.currency === 'gems'
          ? economy.spendGems(hat.price, hat.slot)
          : economy.spend(hat.price, hat.slot);

      if (!paid) {
        audio.play('denied');
        this.toast.show(
          hat.currency === 'gems'
            ? t('shop.toast.notEnoughGems')
            : t('common.toast.notEnoughCoins'),
        );
        return;
      }
      state.addItem(hat.id);
      progression.award('buyItem');
      audio.play('coin');
      this.toast.show(
        t('shop.toast.unlocked', { item: wearableName(hat.slot, hat.id, hat.name) }),
      );
    }

    // Tapping something she is already wearing takes it off.
    state.equip(hat.slot, state.equipped[hat.slot] === hat.id ? null : hat.id);
    this.renderGrid();
  }
}

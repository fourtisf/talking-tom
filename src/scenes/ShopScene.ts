/**
 * Hat shop. Spec §9 — an overlay sheet, not a room, so it runs *over* HomeScene
 * and the pet keeps breathing behind it.
 *
 * Buying and equipping both go through here, and every coin movement goes
 * through `Economy` (§7). This scene never touches `coins`.
 */

import Phaser from 'phaser';

import { PALETTE } from '@/config/palette';
import { HATS, type HatDef } from '@/config/tuning';
import { GameContext } from '@/core/GameContext';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Toast } from '@/ui/Toast';
import { FONT_BODY, FONT_DISPLAY, RADIUS } from '@/ui/theme';
import { placeholderPetArt } from '@/pet/PetArt';
import { SCENE } from '@/scenes/keys';

const COLUMNS = 3;
const CARD_HEIGHT = 104;

export class ShopScene extends Phaser.Scene {
  private context!: GameContext;
  private sheet!: Sheet;
  private grid!: Phaser.GameObjects.Container;
  private toast!: Toast;

  constructor() {
    super(SCENE.shop);
  }

  create(): void {
    this.context = GameContext.from(this);
    const { width, height } = this.scale.gameSize;

    this.sheet = new Sheet(this, width, height, {
      title: 'Hat shop',
      subtitle: 'Tap to buy. Tap again to wear.',
      maxHeightRatio: 0.78,
      onClose: () => {
        this.scene.get(SCENE.home).events.emit('shop-closed');
        this.scene.stop();
      },
    });

    this.grid = this.add.container(0, 0);
    this.sheet.content.add(this.grid);

    this.toast = new Toast(this, width / 2, 128, width - 40);

    this.renderGrid();
    this.sheet.show();
  }

  private renderGrid(): void {
    this.grid.removeAll(true);

    const width = this.scale.gameSize.width;
    const pad = 14;
    const gap = 9;
    const cardWidth = (width - pad * 2 - gap * (COLUMNS - 1)) / COLUMNS;

    HATS.forEach((hat, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const x = pad + col * (cardWidth + gap);
      const y = row * (CARD_HEIGHT + gap);
      this.grid.add(this.buildCard(hat, x, y, cardWidth));
    });

    const rows = Math.ceil(HATS.length / COLUMNS);
    const gridHeight = rows * (CARD_HEIGHT + gap);

    this.grid.add(
      new Button(this, pad, gridHeight + 6, 'Close', {
        width: width - pad * 2,
        tone: 'coral',
        onPress: () => this.sheet.close(),
      }),
    );

    this.sheet.setPanelHeight(gridHeight + 96 + 82);
  }

  private buildCard(
    hat: HatDef,
    x: number,
    y: number,
    cardWidth: number,
  ): Phaser.GameObjects.Container {
    const { state, progression } = this.context;
    const owned = state.owns(hat.id);
    const equipped = state.equipped.hat === hat.id;
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

    // Hat art comes from the pet art provider, so a swapped art pack updates
    // the shop for free.
    const art = placeholderPetArt.createAccessory(this, hat.id);
    if (art) {
      const holder = this.add.container(cardWidth / 2, 36);
      holder.add(art);
      holder.setScale(0.26);
      card.add(holder);
    }

    const textColor = equipped ? '#ffffff' : '#5b486b';
    card.add(
      this.add
        .text(cardWidth / 2, 68, hat.name, {
          fontFamily: FONT_BODY,
          fontSize: '10px',
          color: textColor,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    const caption = !unlocked
      ? `LEVEL ${hat.unlockLevel}`
      : equipped
        ? 'WEARING'
        : owned
          ? 'Tap to wear'
          : `${hat.price}`;

    card.add(
      this.add
        .text(cardWidth / 2, 86, caption, {
          fontFamily: FONT_DISPLAY,
          fontSize: '11.5px',
          color: equipped ? '#ffffff' : unlocked ? '#8a5a00' : '#a995c4',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

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

  private onCardPressed(hat: HatDef): void {
    const { state, economy, progression, audio } = this.context;

    if (!state.owns(hat.id)) {
      if (!economy.spend(hat.price, 'hat')) {
        audio.play('denied');
        this.toast.show('Not enough coins — play a round or watch a video');
        return;
      }
      state.addItem(hat.id);
      progression.award('buyItem');
      audio.play('coin');
      this.toast.show(`Unlocked ${hat.name}`);
    }

    // Tapping an equipped hat takes it off.
    state.equip('hat', state.equipped.hat === hat.id ? null : hat.id);
    this.renderGrid();
  }
}

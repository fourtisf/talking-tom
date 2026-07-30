/**
 * English message catalogue — the SOURCE OF TRUTH.
 *
 * `MessageKey` is derived from this object, and `id.ts` is typed as a total
 * record over it, so a key added here without an Indonesian translation is a
 * COMPILE error rather than a string that silently ships in the wrong language
 * to the audience the game is actually being marketed to.
 *
 * Braces are interpolation slots: `t('common.unlocksAtLevel', { level: 5 })`.
 *
 * Content words — food, hat, task and coin-pack names — live here too, not in
 * `tuning.ts`. Tuning keeps ids and numbers; i18n keeps words. A balance file
 * that also holds display copy cannot be translated without touching balance.
 */

export const EN = {

  /* ---- app ---- */
  'app.name': 'Biskit',

  /* ---- common ---- */
  'common.close': 'Close',
  'common.notNow': 'Not now',
  'common.collect': 'Collect',
  'common.unlocksAtLevel': 'Unlocks at level {level}',
  'common.duration.hours': '{n}h',
  'common.duration.days': '{n}d',
  'common.seconds': '{n}s',
  'common.xp': 'XP',
  'common.toast.notEnoughCoins': 'Not enough coins — play a round or watch a video',

  /* ---- nav ---- */
  'nav.home': 'HOME',
  'nav.kitchen': 'FOOD',
  'nav.bath': 'BATH',
  'nav.bed': 'SLEEP',
  'nav.play': 'PLAY',

  /* ---- stat ---- */
  'stat.hunger': 'hunger',
  'stat.energy': 'energy',
  'stat.fun': 'fun',
  'stat.clean': 'clean',
  'stat.energy.rested': 'rested',

  /* ---- tray ---- */
  'tray.talk.label': 'Talk',
  'tray.talk.caption': 'mimic',
  'tray.pet.label': 'Pet',
  'tray.pet.caption': '+fun',
  'tray.soap.label': 'Soap',
  'tray.soap.caption': 'lather',
  'tray.brush.label': 'Brush',
  'tray.brush.caption': 'scrub',
  'tray.tooth.label': 'Teeth',
  'tray.tooth.caption': 'brush',
  'tray.rinse.label': 'Rinse',
  'tray.rinse.caption': 'wash off',
  'tray.sleep.label': 'Sleep',
  'tray.sleep.caption': '+energy',
  'tray.wake.label': 'Wake',
  'tray.wake.caption': 'up',
  'tray.food.free': 'FREE',
  'tray.food.locked': 'LVL {n}',

  /* ---- home ---- */
  'home.toast.levelUp.one': 'Level {level} — {n} gem added',
  'home.toast.levelUp.other': 'Level {level} — {n} gems added',
  'home.float.levelUp': 'LEVEL {n}!',
  'home.toast.taskDone': 'Task done — {task}',
  'home.toast.asleep': '{pet} is asleep',
  'home.toast.full': '{pet} is full',
  'home.toast.alreadyClean': 'Already sparkling',
  'home.toast.dragFood': 'Drag it to her mouth 🐟',
  'home.toast.dragTool': 'Drag it over {pet} and rub 🫧',
  'home.float.minty': 'minty!',
  'home.float.ouch': 'hey!',
  'home.toast.cross': '{pet} does not like that',
  'home.float.yum': 'yum',
  'home.float.squeaky': 'Squeaky!',
  'home.toast.lightsOut': 'Lights out — energy refilling',
  'home.toast.listening': 'Listening… say something!',
  'home.float.pet1': 'love',
  'home.float.pet2': 'purr',
  'home.float.pet3': 'yay',
  'home.float.pet4': 'nice',
  'home.dailyLogin': 'Day {day} — +{coins} coins',
  'home.return.title': '{pet} missed you, {player}!',
  'home.return.body': 'You were away {duration}. Here\'s what changed:',
  'home.return.capped': '{pet} dozed through the rest — no harm done.',
  'home.return.confirm': 'Say hello',
  'home.ad.tag': '+{n}',

  /* ---- play ---- */
  'play.title': 'Play',
  'play.subtitle': 'Two ways to earn coins.',
  'play.catch.name': 'Catch',
  'play.catch.blurb': 'Grab falling fish, dodge the socks.',
  'play.copycat.name': 'Copycat',
  'play.copycat.blurb': 'She taps a tune. You tap it back.',
  'play.locked': 'Unlocks at level {level}',

  /* ---- catch ---- */
  'catch.score': '{n} caught',
  'catch.result.title': 'Nice catch!',
  'catch.result.line': '{n} caught · +{coins} coins · +{fun} fun',

  /* ---- copycat ---- */
  'copycat.watch': 'Watch',
  'copycat.yourTurn': 'Your turn',
  'copycat.nice': 'Nice',
  'copycat.round': 'Round {round}',
  'copycat.round.steps': 'Round {round} · {n} steps',
  'copycat.end.tooSlow': 'Too slow!',
  'copycat.end.wrong': 'Not that one',
  'copycat.end.perfect': 'Perfect run!',
  'copycat.result.steps.one': '{n} step · +{coins} coins · +{fun} fun',
  'copycat.result.steps.other': '{n} steps · +{coins} coins · +{fun} fun',

  /* ---- shop ---- */
  'home.toast.noNeed': '{pet} does not need to go right now',
  'home.toast.accident': '{pet} could not hold it — tap the puddle to clear it up',
  'home.float.better': 'Phew!',
  'return.accident': '{pet} could not hold it while you were out.',
  'return.needsLitter': '{pet} is desperate for the litter tray.',
  'notify.relief.title': '{pet} needs the litter tray',
  'notify.relief.body': 'Let me out! — {pet}',
  'tray.litter.label': 'Litter',
  'tray.litter.caption': 'tray',

  'nav.loo': 'LOO',
  'tray.toilet.label': 'Toilet',
  'tray.toilet.caption': 'let her go',
  'home.toast.wrongRoom': 'Take {pet} to the loo or the litter tray first',
  'home.float.relieved': 'Ahh!',

  'shop.title': 'Wardrobe',
  'shop.subtitle': 'Tap to buy. Tap again to wear.',
  'shop.tab.hats': 'HATS',
  'shop.tab.outfits': 'OUTFITS',
  'shop.packs.heading': 'GET MORE COINS',
  'shop.card.locked': 'LEVEL {n}',
  'shop.card.wearing': 'WEARING',
  'shop.card.tapToWear': 'Tap to wear',
  'shop.toast.unlocked': 'Unlocked {item}',
  'shop.toast.notEnoughGems': 'Not enough gems — every level up pays some',

  /* ---- tasks ---- */
  'tasks.title': 'Today\'s tasks',
  'tasks.subtitle': 'Finish these to earn coins and level up',
  'tasks.footer.allDone': 'All done — new tasks tomorrow!',
  'tasks.footer.daily': 'New tasks every day',
  'tasks.progress': '{count} / {target}',
  'tasks.reward': '+{coins}  ·  {xp} XP',
  'tasks.claim': 'CLAIM',
  'tasks.collected': 'Collected',
  'tasks.go': 'Go →',
  'tasks.toast.claimed': '+{coins} coins  ·  +{xp} XP',

  /* ---- settings ---- */
  'settings.title': 'Settings',
  'settings.sound': 'Sound',
  'settings.music': 'Music',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.replayTutorial': 'Replay tutorial',
  'settings.toast.tutorialQueued': 'Tutorial will start when you close this',
  'settings.backup': 'Back up {pet}',
  'settings.backup.value': 'Get code',
  'settings.restoreCode': 'Restore from code',
  'settings.restorePurchases': 'Restore purchases',
  'settings.removeAds': 'Remove ads',
  'settings.removeAds.owned': 'Owned',
  'settings.removeAds.buy': 'Buy',
  'settings.version': 'Biskit v{version}',
  'settings.toast.nothingToRestore': 'Nothing to restore on this account.',

  'settings.diagnostics.title': 'Diagnostics',
  'settings.diagnostics.body': 'Counters kept on this device only. Nothing here has ever been sent anywhere.',
  'settings.diagnostics.confirm': 'Copy',
  'settings.diagnostics.copied': '✓ Copied.',

  /* ---- naming ---- */
  'name.title': 'Say hello',
  'name.body': 'Two quick things and she\'s yours. You can change both later in Settings.',
  'name.player.label': 'Your name',
  'name.player.placeholder': 'What should she call you?',
  'name.pet.label': 'Her name',
  'name.pet.placeholder': 'Biskit',
  'name.confirm': 'Start',
  'name.required': 'Both names are needed — pick anything you like.',
  'name.edit.title': 'Names',
  'name.edit.confirm': 'Save',
  'name.edit.cancel': 'Cancel',
  'settings.names': 'Names',
  'home.greeting': 'Hi {player}!',

  /* ---- save ---- */
  'save.backup.body': 'This code is your whole pet — level, coins, hats, everything. Keep it somewhere safe. Anyone with it can restore her, so treat it like a password.',
  'save.backup.confirm': 'Copy code',
  'save.backup.copied': '✓ Copied. Paste it somewhere you will still have next month.',
  'save.backup.copyFailed': 'Could not reach the clipboard — select the code above and copy it by hand.',
  'save.restore.body': 'Paste a backup code to bring that pet back. This REPLACES the pet you have now, and that cannot be undone — back this one up first if you want to keep it.',
  'save.restore.confirm': 'Restore',
  'save.error.empty': 'Paste a backup code first.',
  'save.error.format': 'That does not look like a Biskit code — it should start with \'BSKT1.\'',
  'save.error.version': 'That code is from a newer version of Biskit. Update the game and try again.',
  'save.error.checksum': 'That code is incomplete — copy the whole thing, including the last few characters.',
  'save.error.corrupt': 'That code could not be read.',

  /* ---- voice ---- */
  'voice.prompt.title': 'Let {pet} hear you',
  'voice.prompt.body': 'Say something and {pet} repeats it back in a silly voice. The recording stays on your device and is never uploaded.',
  'voice.prompt.confirm': 'Allow microphone',
  'voice.error.unsupported': 'This device can\'t record, but everything else still works.',
  'voice.error.permissionDenied': 'Allow the microphone to hear {pet} repeat you.',
  'voice.error.noAudio': 'Didn\'t catch that — try again a little louder.',
  'voice.error.playbackFailed': 'Something went wrong playing that back.',

  /* ---- ads ---- */
  'ads.capped': 'That\'s all the video rewards for today — back tomorrow!',
  'ads.noFill': 'No video available right now — nothing was charged.',
  'ads.dismissed': 'Video closed early, so no coins this time.',
  'ads.error': 'Couldn\'t load that video. Try again in a moment.',

  /* ---- iap ---- */
  'iap.restored': 'Purchases restored.',
  'iap.unavailable': 'The store is not available on this device right now.',
  'iap.failed': 'That purchase didn\'t go through. Nothing was charged.',

  /* ---- notify ---- */
  'notify.hunger.title': '{pet} is getting hungry 🐟',
  'notify.hunger.body': 'The food bowl is looking empty.',
  'notify.energy.title': '{pet} is worn out 💤',
  'notify.energy.body': 'A nap would help a lot right now.',
  'notify.fun.title': '{pet} is bored 🎈',
  'notify.fun.body': 'One quick game would fix it.',
  'notify.clean.title': '{pet} needs a scrub 🫧',
  'notify.clean.body': 'Bath time — there are bubbles involved.',

  /* ---- tutorial ---- */
  'tutorial.step1.title': 'This is {pet}',
  'tutorial.step1.body': 'She is yours to look after. Tap her any time for a fuss — she likes that, and it tops up her Fun.',
  'tutorial.step2.title': 'Watch her four meters',
  'tutorial.step2.body': 'Hunger, Energy, Fun and Clean. They fall slowly, even while the app is closed. Keep them up and she stays happy.',
  'tutorial.step3.title': 'Everything lives down here',
  'tutorial.step3.body': 'Food fills her up, Bath cleans her, Sleep refills her Energy, and Play is where the mini-games live.',
  'tutorial.step4.title': 'Tasks tell you what to do',
  'tutorial.step4.body': 'Three every day. Each one names a job, pays coins, and gives the XP that levels you up. Tap the list any time.',
  'tutorial.step5.title': 'That is all of it',
  'tutorial.step5.body': 'Look after her, finish your tasks, spend the coins on hats. Your first task is waiting — go and get it.',
  'tutorial.next': 'NEXT',
  'tutorial.play': 'PLAY',
  'tutorial.skip': 'Skip',

  /* ---- food ---- */
  'food.fish': 'Fish',
  'food.milk': 'Milk',
  'food.steak': 'Steak',
  'food.cake': 'Cake',
  'food.sushi': 'Sushi',
  'food.feast': 'Feast',

  /* ---- hat ---- */
  'hat.bloom': 'Bloom',
  'hat.beanie': 'Beanie',
  'hat.party': 'Party',
  'hat.halo': 'Halo',
  'hat.chef': 'Chef',
  'hat.cans': 'Headset',
  'hat.wizard': 'Wizard',
  'hat.crown': 'Crown',
  'hat.astro': 'Astro',
  'hat.rainbow': 'Rainbow',

  /* ---- outfit ---- */
  'outfit.tee': 'Tee',
  'outfit.dungarees': 'Dungarees',
  'outfit.hoodie': 'Hoodie',
  'outfit.tutu': 'Tutu',
  'outfit.raincoat': 'Raincoat',
  'outfit.space': 'Space Suit',

  /* ---- task ---- */
  'task.feed3.one': 'Feed {pet} {n} time',
  'task.feed3.other': 'Feed {pet} {n} times',
  'task.scrub2.one': 'Give {pet} {n} bath',
  'task.scrub2.other': 'Give {pet} {n} baths',
  'task.pet10.one': 'Pet {pet} {n} time',
  'task.pet10.other': 'Pet {pet} {n} times',
  'task.voice1.one': 'Make {pet} repeat you',
  'task.voice1.other': 'Make {pet} repeat you',
  'task.catch8.one': 'Catch {n} treat in Play',
  'task.catch8.other': 'Catch {n} treats in Play',
  'task.litter2.one': 'Take {pet} to the litter tray {n} time',
  'task.litter2.other': 'Take {pet} to the litter tray {n} times',
  'task.sleep1.one': 'Tuck {pet} into bed',
  'task.sleep1.other': 'Tuck {pet} into bed',
  'task.happy.one': 'Get every meter above {n}',
  'task.happy.other': 'Get every meter above {n}',
  'task.buy1.one': 'Buy a hat in the shop',
  'task.buy1.other': 'Buy a hat in the shop',
  'task.copy5.one': 'Copy {n} step in Copycat',
  'task.copy5.other': 'Copy {n} steps in Copycat',

  /* ---- pack ---- */
  'pack.small': 'Pocketful',
  'pack.small.price': '$0.99',
  'pack.medium': 'Treat Jar',
  'pack.medium.price': '$4.99',
  'pack.large': 'Toy Chest',
  'pack.large.price': '$9.99',
} as const;

export type MessageKey = keyof typeof EN;

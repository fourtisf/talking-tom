/**
 * Indonesian, `id`.
 *
 * Typed as a TOTAL record over `MessageKey`, so this file cannot compile while
 * a key is missing. That is the whole point: the failure mode being designed
 * against is an English string quietly surviving into an Indonesian build.
 *
 * Register is casual throughout — `kamu`, `aja`, `nggak` — to match the game's
 * playful English voice. The backup and restore copy is the deliberate
 * exception and stays in standard Indonesian: those are the strings a player
 * reads when they are about to lose a pet, and slang there reads careless.
 */

import type { MessageKey } from '@/i18n/en';

export const ID: Readonly<Record<MessageKey, string>> = {

  /* ---- app ---- */
  'app.name': 'Biskit',

  /* ---- common ---- */
  'common.close': 'Tutup',
  'common.notNow': 'Nanti aja',
  'common.collect': 'Ambil',
  'common.unlocksAtLevel': 'Kebuka di level {level}',
  'common.duration.hours': '{n} jam',
  'common.duration.days': '{n} hari',
  'common.seconds': '{n} dtk',
  'common.xp': 'XP',
  'common.toast.notEnoughCoins': 'Koin kurang — main sebentar atau tonton video',

  /* ---- nav ---- */
  'nav.home': 'RUMAH',
  'nav.kitchen': 'MAKAN',
  'nav.bath': 'MANDI',
  'nav.bed': 'TIDUR',
  'nav.play': 'MAIN',

  /* ---- stat ---- */
  'stat.hunger': 'lapar',
  'stat.energy': 'energi',
  'stat.fun': 'seru',
  'stat.clean': 'bersih',
  'stat.energy.rested': 'istirahat',

  /* ---- tray ---- */
  'tray.talk.label': 'Ngomong',
  'tray.talk.caption': 'tiru',
  'tray.pet.label': 'Elus',
  'tray.pet.caption': '+seru',
  'tray.scrub.label': 'Gosok',
  'tray.scrub.caption': 'ketuk',
  'tray.rinse.label': 'Bilas',
  'tray.rinse.caption': 'ketuk',
  'tray.sleep.label': 'Tidur',
  'tray.sleep.caption': '+energi',
  'tray.wake.label': 'Bangun',
  'tray.wake.caption': 'melek',
  'tray.food.free': 'GRATIS',
  'tray.food.locked': 'LVL {n}',

  /* ---- home ---- */
  'home.toast.levelUp.one': 'Level {level} — dapat {n} permata',
  'home.toast.levelUp.other': 'Level {level} — dapat {n} permata',
  'home.float.levelUp': 'LEVEL {n}!',
  'home.toast.taskDone': 'Tugas beres — {task}',
  'home.toast.asleep': 'Biskit lagi tidur',
  'home.toast.full': 'Biskit udah kenyang',
  'home.toast.alreadyClean': 'Udah kinclong kok',
  'home.float.squeaky': 'Wangi!',
  'home.toast.lightsOut': 'Lampu mati — energi lagi ngisi',
  'home.toast.listening': 'Lagi dengerin… ngomong dong!',
  'home.float.pet1': 'sayang',
  'home.float.pet2': 'nyaman',
  'home.float.pet3': 'asik',
  'home.float.pet4': 'gemas',
  'home.dailyLogin': 'Hari ke-{day} — +{coins} koin',
  'home.return.title': 'Biskit kangen kamu!',
  'home.return.body': 'Kamu pergi {duration}. Ini yang berubah:',
  'home.return.capped': 'Sisanya Biskit tidur aja — aman kok.',
  'home.return.confirm': 'Sapa dia',
  'home.ad.tag': '+{n}',

  /* ---- play ---- */
  'play.title': 'Main',
  'play.subtitle': 'Dua cara buat ngumpulin koin.',
  'play.catch.name': 'Tangkap',
  'play.catch.blurb': 'Sambar ikan yang jatuh, hindari kaus kakinya.',
  'play.copycat.name': 'Tiru Aku',
  'play.copycat.blurb': 'Dia ketuk nadanya. Kamu ketuk balik.',
  'play.locked': 'Kebuka di level {level}',

  /* ---- catch ---- */
  'catch.score': '{n} tertangkap',
  'catch.result.title': 'Mantap!',
  'catch.result.line': '{n} tertangkap · +{coins} koin · +{fun} seru',

  /* ---- copycat ---- */
  'copycat.watch': 'Lihat dulu',
  'copycat.yourTurn': 'Giliranmu',
  'copycat.nice': 'Sip',
  'copycat.round': 'Ronde {round}',
  'copycat.round.steps': 'Ronde {round} · {n} langkah',
  'copycat.end.tooSlow': 'Kelamaan!',
  'copycat.end.wrong': 'Bukan yang itu',
  'copycat.end.perfect': 'Sempurna!',
  'copycat.result.steps.one': '{n} langkah · +{coins} koin · +{fun} seru',
  'copycat.result.steps.other': '{n} langkah · +{coins} koin · +{fun} seru',

  /* ---- shop ---- */
  'shop.title': 'Toko topi',
  'shop.subtitle': 'Ketuk buat beli. Ketuk lagi buat dipakai.',
  'shop.packs.heading': 'TAMBAH KOIN',
  'shop.card.locked': 'LEVEL {n}',
  'shop.card.wearing': 'DIPAKAI',
  'shop.card.tapToWear': 'Ketuk buat pakai',
  'shop.toast.unlocked': '{item} kebuka!',
  'shop.toast.notEnoughGems': 'Permata kurang — tiap naik level dapat kok',

  /* ---- tasks ---- */
  'tasks.title': 'Tugas hari ini',
  'tasks.subtitle': 'Selesaikan buat dapat koin dan naik level',
  'tasks.footer.allDone': 'Beres semua — besok ada lagi!',
  'tasks.footer.daily': 'Tugas baru tiap hari',
  'tasks.progress': '{count} / {target}',
  'tasks.reward': '+{coins}  ·  {xp} XP',
  'tasks.claim': 'AMBIL',
  'tasks.collected': 'Sudah diambil',
  'tasks.go': 'Ke sana →',
  'tasks.toast.claimed': '+{coins} koin  ·  +{xp} XP',

  /* ---- settings ---- */
  'settings.title': 'Pengaturan',
  'settings.sound': 'Suara',
  'settings.music': 'Musik',
  'settings.on': 'Nyala',
  'settings.off': 'Mati',
  'settings.language': 'Bahasa',
  'settings.language.value': 'Bahasa Indonesia',
  'settings.replayTutorial': 'Ulangi tutorial',
  'settings.toast.tutorialQueued': 'Tutorial jalan begitu ini ditutup',
  'settings.backup': 'Cadangkan Biskit',
  'settings.backup.value': 'Ambil kode',
  'settings.restoreCode': 'Pulihkan dari kode',
  'settings.restorePurchases': 'Pulihkan pembelian',
  'settings.removeAds': 'Hapus iklan',
  'settings.removeAds.owned': 'Dimiliki',
  'settings.removeAds.buy': 'Beli',
  'settings.version': 'Biskit v{version}',
  'settings.toast.nothingToRestore': 'Tidak ada yang bisa dipulihkan di akun ini.',

  /* ---- save ---- */
  'save.backup.body': 'Kode ini berisi seluruh peliharaanmu — level, koin, topi, semuanya. Simpan di tempat yang aman. Siapa pun yang punya kode ini bisa memulihkan Biskit, jadi perlakukan seperti kata sandi.',
  'save.backup.confirm': 'Salin kode',
  'save.backup.copied': '✓ Tersalin. Tempel di tempat yang masih kamu punya bulan depan.',
  'save.backup.copyFailed': 'Papan klip tidak bisa diakses — pilih kodenya di atas lalu salin manual.',
  'save.restore.body': 'Tempel kode cadangan untuk mengembalikan peliharaan itu. Ini MENGGANTI peliharaan yang sekarang dan tidak bisa dibatalkan — cadangkan dulu kalau mau disimpan.',
  'save.restore.confirm': 'Pulihkan',
  'save.error.empty': 'Tempel kode cadangannya dulu.',
  'save.error.format': 'Sepertinya itu bukan kode Biskit — harusnya diawali \'BSKT1.\'',
  'save.error.version': 'Kode itu dari Biskit versi yang lebih baru. Perbarui gamenya lalu coba lagi.',
  'save.error.checksum': 'Kodenya belum lengkap — salin semuanya, termasuk beberapa karakter terakhir.',
  'save.error.corrupt': 'Kode itu tidak bisa dibaca.',

  /* ---- voice ---- */
  'voice.prompt.title': 'Biar Biskit dengar suaramu',
  'voice.prompt.body': 'Ngomong apa aja, nanti Biskit tiruin pakai suara lucu. Rekamannya cuma disimpan di HP kamu dan nggak pernah diunggah.',
  'voice.prompt.confirm': 'Izinkan mikrofon',
  'voice.error.unsupported': 'HP ini nggak bisa merekam, tapi sisanya tetap jalan kok.',
  'voice.error.permissionDenied': 'Izinkan mikrofon biar Biskit bisa nirukan kamu.',
  'voice.error.noAudio': 'Nggak kedengeran — coba lagi agak kencang.',
  'voice.error.playbackFailed': 'Ada yang error waktu memutar ulang.',

  /* ---- ads ---- */
  'ads.capped': 'Hadiah video hari ini udah habis — balik lagi besok ya!',
  'ads.noFill': 'Belum ada video sekarang — nggak ada yang terpotong.',
  'ads.dismissed': 'Videonya ditutup duluan, jadi belum dapat koin.',
  'ads.error': 'Videonya gagal dimuat. Coba lagi sebentar.',

  /* ---- iap ---- */
  'iap.restored': 'Pembelian dipulihkan.',
  'iap.unavailable': 'Tokonya belum tersedia di perangkat ini.',
  'iap.failed': 'Pembeliannya gagal. Nggak ada yang ditagih.',

  /* ---- notify ---- */
  'notify.hunger.title': 'Biskit mulai lapar 🐟',
  'notify.hunger.body': 'Mangkuknya kelihatan kosong.',
  'notify.energy.title': 'Biskit capek banget 💤',
  'notify.energy.body': 'Tidur sebentar pasti bikin segar.',
  'notify.fun.title': 'Biskit bosan 🎈',
  'notify.fun.body': 'Main sebentar aja udah beres.',
  'notify.clean.title': 'Biskit perlu digosok 🫧',
  'notify.clean.body': 'Waktunya mandi — ada busanya lho.',

  /* ---- tutorial ---- */
  'tutorial.step1.title': 'Kenalin, ini Biskit',
  'tutorial.step1.body': 'Dia peliharaanmu. Ketuk kapan aja buat dielus — dia suka, dan Serunya ikut naik.',
  'tutorial.step2.title': 'Perhatikan empat meternya',
  'tutorial.step2.body': 'Lapar, Energi, Seru, dan Bersih. Semuanya turun pelan-pelan, bahkan waktu aplikasinya ditutup. Jaga tetap penuh biar dia senang.',
  'tutorial.step3.title': 'Semuanya ada di bawah sini',
  'tutorial.step3.body': 'Makan bikin kenyang, Mandi bikin bersih, Tidur ngisi Energi, dan Main isinya mini-game.',
  'tutorial.step4.title': 'Tugas kasih tahu harus ngapain',
  'tutorial.step4.body': 'Tiga tiap hari. Masing-masing kasih satu pekerjaan, bayar koin, dan kasih XP buat naik level. Ketuk daftarnya kapan aja.',
  'tutorial.step5.title': 'Segitu aja',
  'tutorial.step5.body': 'Rawat dia, selesaikan tugasnya, koinnya buat beli topi. Tugas pertamamu udah nunggu — gas!',
  'tutorial.next': 'LANJUT',
  'tutorial.play': 'MAIN',
  'tutorial.skip': 'Lewati',

  /* ---- food ---- */
  'food.fish': 'Ikan',
  'food.milk': 'Susu',
  'food.steak': 'Steik',
  'food.cake': 'Kue',
  'food.sushi': 'Sushi',
  'food.feast': 'Prasmanan',

  /* ---- hat ---- */
  'hat.bloom': 'Bunga',
  'hat.beanie': 'Kupluk',
  'hat.party': 'Pesta',
  'hat.halo': 'Malaikat',
  'hat.chef': 'Koki',
  'hat.cans': 'Headset',
  'hat.wizard': 'Penyihir',
  'hat.crown': 'Mahkota',
  'hat.astro': 'Antariksa',
  'hat.rainbow': 'Pelangi',

  /* ---- task ---- */
  'task.feed3.one': 'Kasih Biskit makan {n} kali',
  'task.feed3.other': 'Kasih Biskit makan {n} kali',
  'task.scrub2.one': 'Mandiin Biskit {n} kali',
  'task.scrub2.other': 'Mandiin Biskit {n} kali',
  'task.pet10.one': 'Elus Biskit {n} kali',
  'task.pet10.other': 'Elus Biskit {n} kali',
  'task.voice1.one': 'Bikin Biskit nirukan kamu',
  'task.voice1.other': 'Bikin Biskit nirukan kamu',
  'task.catch8.one': 'Tangkap {n} camilan di Main',
  'task.catch8.other': 'Tangkap {n} camilan di Main',
  'task.sleep1.one': 'Selimutin Biskit sampai tidur',
  'task.sleep1.other': 'Selimutin Biskit sampai tidur',
  'task.happy.one': 'Bikin semua meter di atas {n}',
  'task.happy.other': 'Bikin semua meter di atas {n}',
  'task.buy1.one': 'Beli topi di toko',
  'task.buy1.other': 'Beli topi di toko',
  'task.copy5.one': 'Tiru {n} langkah di Tiru Aku',
  'task.copy5.other': 'Tiru {n} langkah di Tiru Aku',

  /* ---- pack ---- */
  'pack.small': 'Sekantong',
  'pack.small.price': 'Rp 15.000',
  'pack.medium': 'Toples Camilan',
  'pack.medium.price': 'Rp 79.000',
  'pack.large': 'Peti Mainan',
  'pack.large.price': 'Rp 159.000',
};

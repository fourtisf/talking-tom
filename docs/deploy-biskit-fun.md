# Deploy Biskit ke biskit.fun (VPS 31.97.66.123)

Semua perintah di bawah dijalankan **di terminal VPS Anda** (yang sudah terbuka
di VS Code, `root@srv1068207`), bukan di mesin lokal.

DNS sudah benar dan tidak perlu diubah:

| Jenis | Nama | Konten |
|---|---|---|
| A | `@` | `31.97.66.123` |
| CNAME | `www` | `biskit.fun` |

---

## Ringkasan: Biskit jauh lebih sederhana dari candle-rush

candle-rush jalan sebagai **dua proses pm2** (`candle-rush-api` + `candle-rush-web`).

Biskit **bukan** aplikasi server. Hasil build-nya hanya file statis (HTML + JS,
total 1,4 MB). Tidak ada backend, tidak ada database, tidak ada yang perlu
diawasi pm2. nginx menyajikan foldernya langsung.

Artinya: **Anda tidak perlu menambahkan entri pm2 untuk Biskit sama sekali.**

---

## LANGKAH 1 — Cari lokasi file candle-rush (jangan hapus dulu)

pm2 tahu persis di mana file-nya. Jangan menebak:

```bash
pm2 describe candle-rush-api | grep -E "script path|exec cwd"
pm2 describe candle-rush-web | grep -E "script path|exec cwd"
```

Lihat juga seluruh konfigurasinya, termasuk port yang dipakai:

```bash
pm2 jlist | python3 -m json.tool | grep -E '"name"|"pm_exec_path"|"pm_cwd"|"PORT"'
```

Dan cek apa yang sedang mendengarkan di port 80 / 443 — ini menentukan apakah
sudah ada nginx atau candle-rush langsung memegang port 80:

```bash
ss -tlnp | grep -E ':80|:443|:3000|:8080'
ls /etc/nginx/sites-enabled/ 2>/dev/null || echo "nginx belum terpasang"
```

---

## LANGKAH 2 — BERHENTI SEJENAK, BACA INI

`candle-rush-api` dan `candle-rush-web` **sedang online**. Menghapusnya tidak
bisa dibatalkan kalau tidak ada backup, dan kalau ada domain lain yang menunjuk
ke sana, domain itu akan mati begitu prosesnya dihentikan.

Sebelum menghapus, jawab dulu tiga hal:

1. Apakah candle-rush masih dipakai, atau memang sudah mau dipensiunkan?
2. Apakah ada domain lain yang mengarah ke VPS ini? Cek dengan
   `ls /etc/nginx/sites-enabled/`.
3. Apakah source code-nya masih ada di GitHub, atau VPS ini satu-satunya
   tempat kodenya berada?

Kalau ragu pada salah satu saja: **lewati Langkah 3 untuk sekarang.** Biskit
tidak butuh candle-rush dihapus untuk bisa jalan — keduanya bisa hidup
berdampingan. Hapus nanti setelah Biskit terbukti jalan.

---

## LANGKAH 3 — Backup dulu, baru hapus candle-rush

Lokasi sudah dipastikan dari `pm2 describe`: **`/opt/candlerush`**
(`script path` = `/opt/candlerush/apps/api/dist/index.js`).

```bash
# a. Pastikan candle-rush-web juga di bawah folder yang sama
pm2 describe candle-rush-web | grep -E "script path|exec cwd"

# b. Cek apakah ada nginx yang mem-proxy ke sana — kalau ada dan tidak
#    dibereskan, situsnya jadi 502 setelah prosesnya hilang.
grep -rl "candlerush\|candle-rush\|proxy_pass" /etc/nginx/sites-enabled/ 2>/dev/null || echo "tidak ada site nginx"

# c. Backup SELURUH folder dulu — murah, dan sekali hilang ya hilang.
tar czf /root/candlerush-backup-$(date +%F).tar.gz /opt/candlerush
ls -lh /root/candlerush-backup-*.tar.gz

# d. Hentikan dan buang dari pm2
pm2 stop candle-rush-api candle-rush-web
pm2 delete candle-rush-api candle-rush-web
pm2 save                        # tanpa ini, prosesnya hidup lagi saat reboot

# e. Pastikan sudah bersih
pm2 list

# f. Baru hapus file-nya
rm -rf /opt/candlerush
```

Backup di `/root` sengaja tidak ikut terhapus. Simpan minimal beberapa minggu.

---

## LANGKAH 4 — Ambil kode Biskit ke VPS

```bash
apt-get update && apt-get install -y git rsync

git clone -b claude/new-session-6iwlke \
  https://github.com/fourtisf/talking-tom.git /opt/biskit
cd /opt/biskit
```

Cek versi Node — Vite 7 butuh Node 20 ke atas:

```bash
node -v
```

Kalau di bawah v20:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

---

## LANGKAH 5 — Deploy

```bash
cd /opt/biskit
bash scripts/deploy-vps.sh
```

Skrip itu: build, salin hasilnya ke `/var/www/biskit.fun`, tulis konfigurasi
nginx (gzip menyala — penting, Phaser 1,2 MB jadi 330 KB), tes konfigurasi, lalu
reload. Skrip ini **tidak menghapus apa pun** di luar folder rilisnya sendiri,
jadi aman dijalankan meski candle-rush masih ada.

Cek:

```bash
curl -I http://biskit.fun            # landing page
curl -I http://biskit.fun/play       # game
curl -I http://biskit.fun/play.html  # link lama
```

Dua yang pertama harus `HTTP/1.1 200 OK` dengan `Content-Type: text/html`. Yang
terakhir harus `301` dengan `Location: /play`.

**Jangan cek `/` saja.** URL game (`/play`) dilayani oleh blok `location` sendiri.
Kalau blok itu hilang, `/` tetap `200` tapi `/play` diam-diam mengembalikan
halaman landing — persis bug "kalau di-refresh malah balik ke landing page".

---

## LANGKAH 6 — HTTPS (wajib, bukan opsional)

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d biskit.fun -d www.biskit.fun
```

**Kenapa wajib:** fitur voice mimic memanggil `getUserMedia`, dan **semua
browser menolak akses mikrofon di origin non-HTTPS.** Lewat `http://` biasa,
fitur andalan game ini mati total. Game-nya tetap bisa dimainkan (penolakan
mikrofon ditangani dengan baik), tapi hook utamanya hilang.

Certbot memasang auto-renew sendiri. Verifikasi:

```bash
systemctl list-timers | grep certbot
```

---

## Update berikutnya

```bash
cd /opt/biskit && git pull && bash scripts/deploy-vps.sh
```

Skrip ini **menulis ulang file config nginx** setiap kali dijalankan — file yang
sama yang diedit `certbot --nginx`. Skrip sudah menangani itu: kalau mendeteksi
config bikinan certbot, ia membuat backup (`*.pre-deploy.<timestamp>`) lalu
menjalankan certbot lagi setelah reload, jadi HTTPS kembali sendiri. Kalau
langkah itu gagal, skrip memberi peringatan kuning dan situs jalan HTTP saja —
jalankan `certbot --nginx -d biskit.fun -d www.biskit.fun` manual.

---

## Kalau ada masalah

| Gejala | Penyebab paling mungkin |
|---|---|
| 502 Bad Gateway | Ada sisa `proxy_pass` dari candle-rush di config nginx lain. Cek `/etc/nginx/sites-enabled/` |
| Halaman lama terus muncul | Cache browser. Config sudah melarang cache untuk `/` dan `/play`; hard-refresh dengan Ctrl+Shift+R |
| Situs lain 502 dan `pm2 resurrect` bilang `ENOENT ... /opt/candlerush/logs/...` | Aplikasinya sudah dihapus dari disk, jadi pm2 tidak bisa menghidupkannya lagi. Daftar pm2-nya basi: `pm2 delete all && pm2 save`. Vhost nginx yang menunjuk ke `127.0.0.1:3000` juga sebaiknya dinonaktifkan (`rm /etc/nginx/sites-enabled/<nama>` lalu `nginx -t && systemctl reload nginx`), kalau tidak error log-nya terus penuh dan menyulitkan diagnosa Biskit |
| `/api/health` 404 dan `systemctl is-active biskit-sync` = `failed` | Port save-sync-nya sudah dipakai proses lain. Cek dengan `ss -tlnp \| grep 8787` — kalau ada `docker-proxy` atau apa pun di situ, jalankan ulang `bash scripts/deploy-vps.sh`: skrip sekarang mendeteksi tabrakan port dan pindah sendiri ke port bebas berikutnya, lalu mengarahkan nginx ke sana. Mau port tertentu? `SYNC_PORT=9001 bash scripts/deploy-vps.sh` |
| Situs lain di VPS ini 502 / `connect() failed (111)` ke `127.0.0.1:3000` | Bukan Biskit — Biskit tidak pakai pm2 dan tidak menyentuh port 3000. Prosesnya hilang dari pm2 (biasanya setelah reboot tanpa `pm2 resurrect`). Cek `ls ~/.pm2/dump.pm2 && pm2 resurrect` |
| Refresh di `/play` malah balik ke landing page | Blok `location = /play` tidak ada di config nginx, jadi permintaannya jatuh ke catch-all. Jalankan ulang `bash scripts/deploy-vps.sh`, lalu pastikan dengan `curl -I http://biskit.fun/play` |
| Layar putih di `/play`, konsol error 404 aset | URL-nya jadi `/play/` (ada garis miring di akhir). Vite pakai `base: './'`, jadi aset ikut dicari di `/play/assets/`. Blok `location = /play/ { return 301 /play; }` yang menangani ini — pastikan blok itu ada |
| Buka `/play` dapat 404 | `dist/play.html` tidak ada — kemungkinan besar build-nya `npm run build:app`. Jalankan `npm run build` |
| 403 Forbidden | Izin file. Jalankan ulang skrip — ia menetapkan `www-data` dan mode 644/755 |
| Halaman kosong, konsol error 404 aset | `/var/www/biskit.fun/assets/` kosong; build gagal diam-diam. Jalankan `npm run build` manual dan lihat pesannya |
| Mikrofon tidak jalan | Belum HTTPS. Lihat Langkah 6 |
| Layar hitam di iPhone | Suara belum ter-unlock sampai sentuhan pertama — itu normal. Kalau tetap hitam, buka Safari Web Inspector |

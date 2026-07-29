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
curl -I http://biskit.fun
```

Harus `HTTP/1.1 200 OK` dengan `Content-Type: text/html`.

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

---

## Kalau ada masalah

| Gejala | Penyebab paling mungkin |
|---|---|
| 502 Bad Gateway | Ada sisa `proxy_pass` dari candle-rush di config nginx lain. Cek `/etc/nginx/sites-enabled/` |
| Halaman lama terus muncul | Cache browser. Config sudah melarang cache untuk `index.html`; hard-refresh dengan Ctrl+Shift+R |
| 403 Forbidden | Izin file. Jalankan ulang skrip — ia menetapkan `www-data` dan mode 644/755 |
| Halaman kosong, konsol error 404 aset | `/var/www/biskit.fun/assets/` kosong; build gagal diam-diam. Jalankan `npm run build` manual dan lihat pesannya |
| Mikrofon tidak jalan | Belum HTTPS. Lihat Langkah 6 |
| Layar hitam di iPhone | Suara belum ter-unlock sampai sentuhan pertama — itu normal. Kalau tetap hitam, buka Safari Web Inspector |

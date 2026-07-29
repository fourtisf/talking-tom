#!/usr/bin/env bash
#
# Deploy Biskit to a VPS behind nginx.
#
# Run this ON THE VPS as root:
#   bash scripts/deploy-vps.sh
#
# Biskit builds to a folder of static files — there is no Node server and
# nothing for pm2 to supervise. nginx serves the folder directly, which is
# fewer moving parts than a supervised process and cannot crash at 3am.
#
# The script is idempotent: run it again after every `git pull` to ship an
# update. It never deletes anything outside its own release directory.

set -euo pipefail

DOMAIN="${DOMAIN:-biskit.fun}"
APP_DIR="${APP_DIR:-/opt/biskit}"
WEB_ROOT="${WEB_ROOT:-/var/www/${DOMAIN}}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mXX  %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo bash scripts/deploy-vps.sh)"
[[ -f package.json ]] || die "Run from the repo root — package.json not found here."

say "1/6  Checking prerequisites"
command -v node >/dev/null || die "node is not installed"
node_major="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
(( node_major >= 20 )) || die "node ${node_major} is too old; Vite 7 needs Node 20+"
echo "node $(node -v), npm $(npm -v)"

if ! command -v nginx >/dev/null; then
  say "nginx not found — installing"
  apt-get update -qq
  apt-get install -y -qq nginx
fi

say "2/6  Building"
# `npm ci` needs the lockfile; fall back to install if it is absent.
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
npm run build
[[ -f dist/index.html ]] || die "Build produced no dist/index.html"
echo "built $(du -sh dist | cut -f1) into dist/"

say "3/6  Publishing to ${WEB_ROOT}"
mkdir -p "${WEB_ROOT}"
# --delete removes files from OLD builds only, inside WEB_ROOT. Vite emits
# content-hashed filenames, so without this the directory grows forever.
rsync -a --delete dist/ "${WEB_ROOT}/"
chown -R www-data:www-data "${WEB_ROOT}"
find "${WEB_ROOT}" -type d -exec chmod 755 {} +
find "${WEB_ROOT}" -type f -exec chmod 644 {} +

say "4/6  Writing nginx site"
cat > "${NGINX_SITE}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    # Phaser is ~1.2MB raw and ~330KB gzipped. This is the single biggest
    # thing you can do for load time on mobile data.
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Asset filenames are content-hashed, so a given URL never changes content.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # index.html points at those hashes, so it must NEVER be cached — a stale
    # copy sends players to asset URLs that no longer exist.
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # The game holds no server-side secrets, but these cost nothing.
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
NGINX

ln -sfn "${NGINX_SITE}" "/etc/nginx/sites-enabled/${DOMAIN}"

say "5/6  Testing and reloading nginx"
nginx -t || die "nginx config test failed — nothing was reloaded"
systemctl reload nginx
systemctl enable --now nginx >/dev/null 2>&1 || true

say "6/6  Done"
cat <<DONE

  Served from : ${WEB_ROOT}
  Site config : ${NGINX_SITE}
  Check       : curl -I http://${DOMAIN}

  NEXT, AND NOT OPTIONAL — enable HTTPS:

      apt-get install -y certbot python3-certbot-nginx
      certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}

  The voice-mimic feature calls getUserMedia, and every browser refuses
  microphone access on a non-HTTPS origin. Over plain http:// that feature is
  dead on arrival — the game stays playable, but the signature hook does not
  work at all.

DONE

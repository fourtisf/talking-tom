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
# `npm ci` is the right call: it is reproducible and it refuses to run when
# package.json and package-lock.json have drifted apart. But refusing to run is
# the wrong outcome for a deploy — a stale lockfile should not take the site
# down. So: try it, and on failure say loudly what is wrong and carry on with
# `npm install`, which resolves and rewrites the lockfile.
if [[ -f package-lock.json ]]; then
  if ! npm ci; then
    warn "npm ci failed — package.json and package-lock.json are out of sync."
    warn "Falling back to 'npm install'. Commit the regenerated lockfile so the"
    warn "next deploy is reproducible again."
    npm install
  fi
else
  warn "No package-lock.json — installing without a lockfile is not reproducible."
  npm install
fi
npm run build
[[ -f dist/index.html ]] || die "Build produced no dist/index.html"
# The app bundle renames play.html to index.html, so it passes the guard above
# with no game page on disk. Under the routing below that is a hard 404 on
# /play rather than a soft fall-back, so check for it explicitly.
[[ -f dist/play.html ]] || die "Build produced no dist/play.html — /play would 404. Did you run 'npm run build:app' by mistake?"
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

# certbot --nginx edits this exact file in place, adding the 443 listener and
# the ssl_certificate lines. Overwriting it therefore takes HTTPS down silently:
# nginx -t still passes and the script still prints "Done". Back it up and put
# TLS back afterwards.
# Decided by whether a CERTIFICATE EXISTS, not by whether the file we are about
# to destroy happens to mention certbot.
#
# The old test grepped ${NGINX_SITE} for 'managed by Certbot'. That is a test of
# the very thing this script is seconds away from overwriting, so it fails open
# in every case where the marker is not there for some unrelated reason — a
# hand-written TLS block, a certbot run that placed the listener elsewhere, or a
# previous deploy whose re-apply silently warned instead of dying. When it fails
# open the site is rewritten HTTP-only, nginx -t passes, "Done" prints, and the
# domain goes dark over https with nothing in the output saying so. The
# certificate on disk is the fact that actually matters.
TLS_EXPECTED=0
if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  TLS_EXPECTED=1
  say "Certificate found for ${DOMAIN} — TLS will be re-applied after the reload"
fi
if [[ -f "${NGINX_SITE}" ]]; then
  cp "${NGINX_SITE}" "${NGINX_SITE}.pre-deploy.$(date +%s)"
fi

# QUOTED heredoc. The config is full of nginx runtime variables, and under
# `set -u` an unquoted heredoc aborts on the first one it does not recognise —
# after `cat >` has already truncated the site file. Placeholders are
# substituted afterwards instead.
cat > "${NGINX_SITE}" <<'NGINX'
# ---- www -> apex ---------------------------------------------------------
# Not cosmetic: saves live in Capacitor Preferences, whose web adapter is
# origin-scoped. Serving both hostnames means a player who arrives on www meets
# an empty pet with no way back to the one they raised.
server {
    listen 80;
    listen [::]:80;
    server_name www.__DOMAIN__;
    # $request_uri already carries the query string.
    return 301 $scheme://__DOMAIN__$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;

    root __WEB_ROOT__;

    # INVARIANT: `location = /` must exist. It serves index.html through
    # try_files, which does NOT re-enter location matching. Remove it and the
    # index module answers "/" by internally redirecting to "/index.html";
    # that redirect DOES re-run location matching, lands in
    # `location = /index.html`, hits its 301, and loops forever.

    # Phaser is ~1.2MB raw and ~330KB gzipped. This is the single biggest
    # thing you can do for load time on mobile data.
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    # nginx moved .js from application/javascript to text/javascript in 1.21.1
    # and distro builds differ, so both are listed.
    gzip_types text/plain text/css text/javascript application/javascript
               application/json application/manifest+json application/wasm
               image/svg+xml;

    # add_header does NOT merge: a location declaring any add_header discards
    # every inherited one. These two are therefore repeated verbatim in each
    # location that sets Cache-Control. Here they cover the 301 blocks.
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ---- canonical redirects ---------------------------------------------
    # `return` does not append the query string, hence $is_args$args.
    # These do not loop with the pages below: try_files serves a found file
    # from INSIDE the current location and never re-runs location matching.
    # Do NOT swap try_files for `rewrite ^ /play.html last;` — that re-enters
    # and loops.
    location = /index.html { return 301 /$is_args$args; }
    location = /play.html  { return 301 /play$is_args$args; }

    # /play/ redirects rather than serving: Vite builds with base './', so
    # under a trailing slash the game asks for /play/assets/… and every script
    # 404s. A blank 200 is strictly worse than a redirect.
    location = /play/      { return 301 /play$is_args$args; }

    # ---- the two real pages ----------------------------------------------
    # Both point at content-hashed assets, so neither may be cached.
    # `no-cache` alone, NOT `no-cache, no-store`: no-cache already forces a
    # conditional request, while omitting no-store keeps the game page
    # eligible for the back/forward cache instead of cold-booting Phaser on
    # every Back press.
    location = / {
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Cache-Control "no-cache" always;
        try_files /index.html =404;
    }

    location = /play {
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Cache-Control "no-cache" always;
        try_files /play.html =404;
    }

    # ---- hashed assets ----------------------------------------------------
    # `^~` so this wins outright over `/`. One Cache-Control, not two:
    # `expires 1y` PLUS an add_header emits two conflicting header lines.
    # The scoped error_page stops a missing chunk being answered with 21KB of
    # landing-page HTML.
    location ^~ /assets/ {
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
        error_page 404 = @asset404;
    }
    location @asset404 {
        default_type text/plain;
        return 404 "not found\n";
    }

    # ---- everything else --------------------------------------------------
    # Deliberately NOT `try_files $uri $uri/ /index.html;`. Biskit has no
    # client-side router, so that SPA catch-all bought nothing and was the bug:
    # it answered /play, /play/ and every typo with HTTP 200 and the landing
    # page — the "refresh sends me to the landing page" report.
    location / {
        try_files $uri =404;
    }

    # Real 404 status, landing page as the body. A named location is reachable
    # only from error_page/try_files, never from a URI, so it cannot loop.
    error_page 404 @notfound;
    location @notfound {
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Cache-Control "no-cache" always;
        try_files /index.html =404;
    }
}
NGINX

sed -i "s#__DOMAIN__#${DOMAIN}#g; s#__WEB_ROOT__#${WEB_ROOT}#g" "${NGINX_SITE}"
# `cmd && die` would trip `set -e` on the *success* path, because grep exits 1
# when it finds nothing. An explicit `if` is the only safe shape here.
if grep -q '__DOMAIN__\|__WEB_ROOT__' "${NGINX_SITE}"; then
  die "Placeholder substitution failed in ${NGINX_SITE}"
fi

ln -sfn "${NGINX_SITE}" "/etc/nginx/sites-enabled/${DOMAIN}"

say "5/6  Testing and reloading nginx"
nginx -t || die "nginx config test failed — nothing was reloaded"
systemctl reload nginx
systemctl enable --now nginx >/dev/null 2>&1 || true

if (( TLS_EXPECTED )); then
  say "Re-applying TLS"
  # `die`, not `warn`. A certificate exists, so the browser will have been to
  # this domain over https and will try https again; leaving it HTTP-only is
  # not a degraded deploy, it is an outage.
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --keep-until-expiring \
    || die "certbot --nginx failed and a certificate exists for ${DOMAIN}. The site is HTTP-only right now, which browsers will refuse. Restore ${NGINX_SITE}.pre-deploy.* or re-run certbot by hand."
fi

say "6/7  Verifying"

# The script used to print "Done" and then hand the operator three curl
# commands to run themselves. That is how a deploy reported success while the
# domain served 500s: nginx -t only parses the config, it never asks the config
# to answer a request. These are the same three checks, run here, and a failure
# stops the script with the body that came back rather than a green tick.
# Over the scheme visitors actually use, and through SNI.
#
# The first version of this checked http://127.0.0.1 with a Host header only.
# That is not a test of the site: this box serves nine domains, and when
# biskit.fun lost its 443 listener, http kept answering 200 while https fell
# through SNI to whichever vhost is the default on 443 — apoge.fun — whose SPA
# catch-all then cycled and returned 500. Every http check was green throughout.
#
# `--resolve` rather than a Host header, because a Host header does not drive
# SNI, and SNI is the thing that picks the wrong server block.
verify() {
  local path="$1" want="$2" label="$3" code
  local url="http://${DOMAIN}${path}" resolve="${DOMAIN}:80:127.0.0.1"
  if (( TLS_EXPECTED )); then
    url="https://${DOMAIN}${path}"
    resolve="${DOMAIN}:443:127.0.0.1"
  fi

  code="$(curl -s -o /tmp/biskit-verify.out -w '%{http_code}' --max-time 10 \
    --resolve "${resolve}" "${url}" || echo 000)"

  if [[ "${code}" != "${want}" ]]; then
    warn "${label}: expected ${want}, got ${code}  (${url})"
    head -c 400 /tmp/biskit-verify.out >&2 || true
    echo >&2
    return 1
  fi

  # A 200 from the WRONG vhost is still a 200. Only our pages say "Biskit".
  if [[ "${want}" == "200" && "${path}" != *.woff2 ]] \
     && ! grep -qi 'biskit' /tmp/biskit-verify.out; then
    warn "${label}: answered ${code}, but the body is not a Biskit page — another vhost took the request."
    head -c 200 /tmp/biskit-verify.out >&2 || true
    echo >&2
    return 1
  fi

  say "  ${label}: ${code}"
}

VERIFY_FAILED=0
verify "/"          200 "landing"         || VERIFY_FAILED=1
verify "/play"      200 "game"            || VERIFY_FAILED=1
verify "/play.html" 301 "play.html -> /play" || VERIFY_FAILED=1
verify "/fonts/fredoka.woff2" 200 "display font" || VERIFY_FAILED=1

if (( VERIFY_FAILED )); then
  echo >&2
  warn "The site is NOT serving correctly. Most recent nginx errors:"
  tail -n 15 /var/log/nginx/error.log >&2 2>/dev/null || true
  die "Deploy finished but verification failed — see above. ${NGINX_SITE}.pre-deploy.* holds the previous config."
fi

say "7/7  Done"
cat <<DONE

  Served from : ${WEB_ROOT}
  Site config : ${NGINX_SITE}
  Verified    : /, /play, /play.html and the display font all answered
                correctly against 127.0.0.1 with a ${DOMAIN} Host header.

  NEXT, AND NOT OPTIONAL — enable HTTPS:

      apt-get install -y certbot python3-certbot-nginx
      certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}

  The voice-mimic feature calls getUserMedia, and every browser refuses
  microphone access on a non-HTTPS origin. Over plain http:// that feature is
  dead on arrival — the game stays playable, but the signature hook does not
  work at all.

DONE

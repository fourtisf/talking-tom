/**
 * Guards on the nginx site that `scripts/deploy-vps.sh` writes.
 *
 * These are here because the routing bug they describe was invisible: the site
 * returned HTTP 200 for every URL, so a `curl -I http://biskit.fun` smoke check
 * passed while `/play` quietly served the landing page. A status code cannot
 * catch that; only asserting on the shape of the config can.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SCRIPT = readFileSync(
  fileURLToPath(new URL('../scripts/deploy-vps.sh', import.meta.url)),
  'utf8',
);

/** The heredoc body, as nginx will see it after placeholder substitution. */
const NGINX = (() => {
  const open = "<<'NGINX'\n";
  const start = SCRIPT.indexOf(open);
  if (start === -1) {
    throw new Error(
      "deploy-vps.sh no longer writes the nginx site with a quoted <<'NGINX' heredoc. " +
        'An unquoted one aborts under `set -u` on $is_args, after `cat >` has already ' +
        'truncated the live site file. Restore the quoting; do not weaken this test.',
    );
  }
  const body = SCRIPT.slice(start + open.length);
  const end = body.indexOf('\nNGINX\n');
  if (end === -1) throw new Error('deploy-vps.sh has an unterminated NGINX heredoc.');
  return body.slice(0, end);
})();

/** Comments explain the traps; only directives should be asserted on. */
const DIRECTIVES = NGINX.split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');

describe('deploy nginx site', () => {
  it('serves the game at /play from an exact-match location', () => {
    // Exact match, not a prefix: a prefix would also swallow /playground.
    expect(DIRECTIVES).toMatch(/location\s*=\s*\/play\s*\{/);
    expect(DIRECTIVES).toMatch(/try_files\s+\/play\.html\s+=404;/);
  });

  it('never restores the SPA catch-all that caused the bug', () => {
    // `try_files $uri $uri/ /index.html` answers /play with 200 and the landing
    // page, because this game has no client-side router to pick the URL up.
    expect(DIRECTIVES).not.toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html/);
    expect(DIRECTIVES).toMatch(/location\s*\/\s*\{\s*\n\s*try_files\s+\$uri\s+=404;/);
  });

  it('keeps `location = /` — without it the front door is a redirect loop', () => {
    // `location = /index.html { return 301 /; }` plus nginx's index module
    // internally redirecting / to /index.html is an infinite loop. The exact
    // match on / is what breaks it.
    expect(DIRECTIVES).toMatch(/location\s*=\s*\/\s*\{/);
    expect(DIRECTIVES).toMatch(/try_files\s+\/index\.html\s+=404;/);
  });

  it('301s the extension away and keeps the query string', () => {
    for (const [from, to] of [
      ['/index.html', '/'],
      ['/play.html', '/play'],
      ['/play/', '/play'],
    ] as const) {
      const pattern = new RegExp(
        `location\\s*=\\s*${from.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{\\s*return 301 ${to.replace(/\//g, '\\/')}\\$is_args\\$args;`,
      );
      expect(DIRECTIVES).toMatch(pattern);
    }
    // A bare `return 301 /play;` is valid nginx that silently eats ?ref=.
    expect(DIRECTIVES).not.toMatch(/return 301 \/[a-z]*;/);
  });

  it('never rewrites into the redirect, which would loop forever', () => {
    // `rewrite ... last` re-enters location matching and lands back on the 301.
    // try_files serves a found file without re-matching, which is why it is safe.
    expect(DIRECTIVES).not.toMatch(/rewrite\s+.*play\.html/);
  });

  it('repeats the security headers in every location that sets Cache-Control', () => {
    // nginx's add_header does not merge: a location declaring any add_header
    // discards every inherited one. Deduplicating these silently drops nosniff
    // from the 1.2MB JavaScript bundle.
    const blocks = DIRECTIVES.match(/location[^{]*\{[^}]*\}/g) ?? [];
    const offenders = blocks
      .filter((b) => b.includes('Cache-Control'))
      .filter((b) => !b.includes('X-Content-Type-Options') || !b.includes('Referrer-Policy'));
    expect(offenders).toEqual([]);
  });

  it('emits exactly one Cache-Control per location', () => {
    // `expires 1y` plus an add_header emits two conflicting header lines.
    const blocks = DIRECTIVES.match(/location[^{]*\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      const count =
        (block.match(/Cache-Control/g) ?? []).length + (block.match(/\bexpires\b/g) ?? []).length;
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it('uses a quoted heredoc so nginx variables survive the shell', () => {
    // The script runs under `set -u`. An unquoted heredoc aborts on $is_args
    // AFTER `cat >` has truncated the live site file.
    expect(SCRIPT).toContain("<<'NGINX'");
    expect(SCRIPT).not.toMatch(/cat > "\$\{NGINX_SITE\}" <<NGINX/);
  });

  it('refuses to publish an app build, which has no play.html', () => {
    expect(SCRIPT).toMatch(/\[\[ -f dist\/play\.html \]\] \|\| die/);
  });

  it('puts certbot back after overwriting the file certbot manages', () => {
    expect(SCRIPT).toContain('managed by Certbot');
    expect(SCRIPT).toMatch(/certbot --nginx .*--keep-until-expiring/);
  });
});

/**
 * The save-sync port.
 *
 * 8787 was written into two places that nothing forced to agree — the systemd
 * unit and the nginx `proxy_pass` — and neither checked that anything could
 * actually bind it. On a box with other services that is not a safe
 * assumption: a Docker container had published 0.0.0.0:8787, so the unit died
 * with EADDRINUSE on every restart until systemd parked it in `failed`, while
 * nginx happily proxied /api/ to the container, which answered 404. The
 * deploy's own verification caught the 404 and the cause was invisible,
 * because the port WAS answering — just not us.
 *
 * These pin the two properties that stop it recurring: one source of truth for
 * the number, and a check that the number is free before it is committed to.
 */
describe('the save-sync port', () => {
  it('is a variable, not a literal in the nginx block', () => {
    expect(DIRECTIVES).toContain('proxy_pass http://127.0.0.1:__SYNC_PORT__;');
    // A literal here is the bug: the heredoc is quoted, so a hardcoded port
    // cannot follow the one the unit was given.
    expect(DIRECTIVES).not.toMatch(/proxy_pass http:\/\/127\.0\.0\.1:\d+/);
  });

  it('substitutes it, and refuses to ship the placeholder', () => {
    expect(SCRIPT).toMatch(/s#__SYNC_PORT__#\$\{SYNC_PORT\}#g/);
    expect(SCRIPT).toMatch(/grep -q '[^']*__SYNC_PORT__[^']*' "\$\{NGINX_SITE\}"/);
  });

  it('gives the unit the same variable the proxy gets', () => {
    expect(SCRIPT).toContain('Environment=BISKIT_SYNC_PORT=${SYNC_PORT}');
    expect(SCRIPT).not.toContain('Environment=BISKIT_SYNC_PORT=8787');
  });

  it('checks the port is free, and moves if it is not', () => {
    expect(SCRIPT).toContain('port_taken()');
    expect(SCRIPT).toMatch(/if port_taken "\$\{SYNC_PORT\}"; then/);
    // Silently keeping a taken port is the failure mode this replaced.
    expect(SCRIPT).toMatch(/SYNC_PORT="\$\{moved\}"/);
  });

  it('stops our own service before looking, or it would find itself', () => {
    const stop = SCRIPT.indexOf('systemctl stop biskit-sync');
    const probe = SCRIPT.indexOf('if port_taken');
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(probe);
  });

  it('clears a unit systemd has parked in `failed`', () => {
    // Restart=always plus a permanent bind error trips the start limit, and
    // the unit then stays failed even after the cause is removed — which
    // makes the fix look like it did not work.
    expect(SCRIPT).toContain('systemctl reset-failed biskit-sync');
  });
});

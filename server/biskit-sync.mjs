#!/usr/bin/env node
/**
 * Biskit save sync.
 *
 * The smallest thing that stops a player losing a level 14 cat to "clear
 * browsing data". One save per player, held on the server, pushed on change and
 * pulled at boot.
 *
 * NO DATABASE, ON PURPOSE. A save is under 2KB and is only ever read or written
 * whole, by one owner, keyed by one opaque id — which is a file, not a table.
 * `node:sqlite` would have been the obvious alternative but it only exists from
 * Node 22.5, and the deploy script guarantees 20; a native module would mean a
 * compiler on the box. Files need neither, back up with `tar`, and survive a
 * process crash mid-write because every write is a rename.
 *
 * NO ACCOUNTS, ALSO ON PURPOSE. Asking a player for an email before they have
 * met the cat costs more players than it saves. Identity is a random 128-bit
 * token the client mints on first run. That means the token IS the credential:
 * anyone holding it can read and overwrite that save, which is why it never
 * appears in a URL path, a log line, or an error message, and why the backup
 * code carries it so a player can move to a new device deliberately.
 *
 *   POST /api/save    { token, rev, data }  -> { ok, rev }
 *   GET  /api/save?token=...                -> { rev, data, updatedAt }
 *   GET  /api/health                        -> { ok }
 *
 * Bound to 127.0.0.1. nginx terminates TLS and proxies /api/ here; nothing on
 * the public internet reaches this process directly.
 */

import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.BISKIT_SYNC_PORT ?? 8787);
const HOST = process.env.BISKIT_SYNC_HOST ?? '127.0.0.1';
const DATA_DIR = process.env.BISKIT_SYNC_DIR ?? '/var/lib/biskit-sync';

/** A save is ~1KB. This is generous and still refuses anything absurd. */
const MAX_BODY_BYTES = 32 * 1024;

/** 32 lowercase hex characters. Anything else never touches the filesystem. */
const TOKEN_RE = /^[0-9a-f]{32}$/;

/**
 * Requests per IP per window. Deliberately loose — a real player syncs a
 * handful of times a minute, and the cap exists to stop a script, not to
 * ration play.
 */
const RATE_LIMIT = { windowMs: 60_000, max: 120 };
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

// The map would otherwise grow one entry per IP seen, forever.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT.windowMs;
  for (const [ip, entry] of hits) if (entry.start < cutoff) hits.delete(ip);
}, RATE_LIMIT.windowMs).unref();

/**
 * Sharded by the token's first two characters. One flat directory with a
 * hundred thousand entries is slow to list and slow to back up on most
 * filesystems; 256 subdirectories keeps every one of them small.
 */
function pathFor(token) {
  return join(DATA_DIR, token.slice(0, 2), `${token}.json`);
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

/** Thrown rather than returned so the caller can answer 413 and not 400. */
class TooLarge extends Error {}

function readBody(req, res) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        /*
         * ANSWER, then hang up. Destroying the socket silently was the first
         * version, and it gave curl an empty reply — which a client cannot tell
         * apart from the network dropping. A client that thinks the network
         * dropped retries forever; one told 413 stops and reports.
         */
        send(res, 413, { error: 'too_large' });
        reject(new TooLarge('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function loadSave(token) {
  try {
    return JSON.parse(await readFile(pathFor(token), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Atomic: write a sibling temp file, then rename over the target. A rename
 * within a filesystem is atomic, so a crash mid-write leaves either the old
 * save or the new one, never half of either.
 */
async function storeSave(token, record) {
  const target = pathFor(token);
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(record), 'utf8');
  await rename(temp, target);
}

async function handleGet(url, res) {
  const token = url.searchParams.get('token') ?? '';
  if (!TOKEN_RE.test(token)) return send(res, 400, { error: 'bad_token' });

  const record = await loadSave(token);
  if (!record) return send(res, 404, { error: 'not_found' });
  return send(res, 200, { rev: record.rev, data: record.data, updatedAt: record.updatedAt });
}

async function handlePost(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req, res));
  } catch (err) {
    // 413 has already been sent in that case; anything else is malformed JSON.
    if (err instanceof TooLarge) return undefined;
    return send(res, 400, { error: 'bad_body' });
  }

  const token = typeof payload?.token === 'string' ? payload.token : '';
  const rev = Number(payload?.rev);
  if (!TOKEN_RE.test(token)) return send(res, 400, { error: 'bad_token' });
  if (!Number.isInteger(rev) || rev < 1) return send(res, 400, { error: 'bad_rev' });
  if (typeof payload?.data !== 'object' || payload.data === null) {
    return send(res, 400, { error: 'bad_data' });
  }

  const existing = await loadSave(token);

  /*
   * Higher revision wins, and an equal one is accepted as a no-op rather than
   * an error — a client that retries after a dropped response must not be told
   * it is stale for sending exactly what it already sent.
   *
   * A LOWER revision is refused. That is the case where a phone that has been
   * offline for a week comes back and would otherwise overwrite a week of play
   * from another device. It gets 409 and the current revision, and the client
   * pulls instead.
   */
  if (existing && existing.rev > rev) {
    return send(res, 409, { error: 'stale', rev: existing.rev });
  }

  await storeSave(token, { rev, data: payload.data, updatedAt: Date.now() });
  return send(res, 200, { ok: true, rev });
}

const server = createServer((req, res) => {
  // X-Forwarded-For is set by our own nginx; the leftmost entry is the client.
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  const ip = forwarded || req.socket.remoteAddress || 'unknown';

  if (rateLimited(ip)) return send(res, 429, { error: 'slow_down' });

  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/health') return send(res, 200, { ok: true });
  if (url.pathname !== '/api/save') return send(res, 404, { error: 'not_found' });

  if (req.method === 'GET') return void handleGet(url, res).catch(() => send(res, 500, { error: 'server' }));
  if (req.method === 'POST') return void handlePost(req, res).catch(() => send(res, 500, { error: 'server' }));
  return send(res, 405, { error: 'method' });
});

await mkdir(DATA_DIR, { recursive: true });
server.listen(PORT, HOST, () => {
  console.log(`biskit-sync listening on ${HOST}:${PORT}, data in ${DATA_DIR}`);
});

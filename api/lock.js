/* =====================================================================
 *  /api/lock  —  application form open/closed state
 * =====================================================================
 *  GET  → returns { open: boolean, updatedAt: string|null }     (public)
 *  POST → sets    { open: boolean }                              (admin)
 *
 *  State is persisted as a single JSON file in Vercel Blob, so it
 *  survives deploys and is shared by every visitor.
 *
 *  Auth on POST: reuses ADMIN_USER / ADMIN_PASSWORD that already gate
 *  /admin.html via middleware.js. The browser automatically attaches
 *  the same Basic-Auth header to same-origin requests once the user
 *  has authenticated against /admin.html in this tab.
 *
 *  SETUP (one-time)
 *  ----------------
 *  Vercel dashboard → project → Storage tab → Create database → Blob →
 *  connect to the project. Modern Blob uses OIDC: Vercel auto-issues a
 *  short-lived token to the function at runtime — nothing for you to
 *  paste into env vars. Then push (or redeploy) and you're done.
 *
 *  If Vercel Blob is NOT yet configured the endpoint degrades safely:
 *  GET returns { open: true } so the apply form stays available; POST
 *  returns 500 with a hint surfaced in the admin card.
 * ===================================================================== */

import { put, head } from '@vercel/blob';

const BLOB_KEY = 'state/lock.json';

async function readState() {
  try {
    const meta = await head(BLOB_KEY);
    const res = await fetch(meta.url, { cache: 'no-store' });
    if (!res.ok) throw new Error('blob fetch ' + res.status);
    const data = await res.json();
    return { open: !!data.open, updatedAt: data.updatedAt || null };
  } catch (e) {
    // First boot (file doesn't exist) or Blob misconfigured → default open.
    return { open: true, updatedAt: null };
  }
}

async function writeState(next) {
  // No explicit token check: modern Vercel Blob uses OIDC (auto-issued
  // at runtime). The SDK falls back to BLOB_READ_WRITE_TOKEN for legacy
  // setups. If Blob isn't connected at all, put() throws and our caller
  // surfaces a clean 500.
  await put(BLOB_KEY, JSON.stringify(next), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

function isAuthed(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const user = decoded.slice(0, i);
  const pass = decoded.slice(i + 1);
  const USER = process.env.ADMIN_USER || '';
  const PASS = process.env.ADMIN_PASSWORD || '';
  return PASS.length > 0 && user === USER && pass === PASS;
}

export default async function handler(req, res) {
  // Always disable caching on this endpoint
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'GET') {
    const state = await readState();
    return res.status(200).json({ open: state.open, updatedAt: state.updatedAt });
  }

  if (req.method === 'POST') {
    if (!isAuthed(req)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Era 84 Admin", charset="UTF-8"');
      return res.status(401).send('Unauthorized');
    }
    // Vercel auto-parses JSON bodies when Content-Type is application/json.
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const next = { open: !!body.open, updatedAt: new Date().toISOString() };
    try {
      await writeState(next);
    } catch (e) {
      return res.status(500).json({ error: e && e.message ? e.message : 'write failed' });
    }
    return res.status(200).json(next);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method Not Allowed');
}

/* =====================================================================
 *  Vercel Routing Middleware — real (server-side) lock on the admin page
 * =====================================================================
 *  Runs on Vercel BEFORE admin.html is served, so the password check
 *  happens on the server and is NOT visible in the page source. The
 *  browser shows its native login prompt (HTTP Basic Auth).
 *
 *  SETUP (one-time, after deploying to Vercel)
 *  -------------------------------------------
 *  Set two Environment Variables in your Vercel project
 *  (Project → Settings → Environment Variables, or `vercel env add`):
 *      ADMIN_USER      e.g.  era84
 *      ADMIN_PASSWORD  e.g.  a long secret of your choice
 *  Add them for the "Production" (and "Preview") environments, then
 *  redeploy so they take effect.
 *
 *  Only /admin.html is protected; the public site and apply form are
 *  untouched. (Note: this guards the PAGE — the published Google Sheet
 *  CSV is still reachable by its own URL. Ask about Option 3 to also
 *  move the data behind this lock.)
 * ===================================================================== */

export const config = {
  matcher: ['/admin', '/admin.html'],
  runtime: 'edge',
};

export default function middleware(request) {
  const USER = process.env.ADMIN_USER || '';
  const PASS = process.env.ADMIN_PASSWORD || '';

  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = atob(auth.slice(6)); } catch (e) { decoded = ''; }
    const i = decoded.indexOf(':');
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (PASS && user === USER && pass === PASS) {
      return; // credentials OK → let the request through to admin.html
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Era 84 Admin", charset="UTF-8"' },
  });
}

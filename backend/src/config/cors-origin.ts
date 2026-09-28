/**
 * Which browser origins may call this API.
 *
 * Kept as a pure function so the rules can be tested: getting this wrong is
 * hard to diagnose from the outside. A rejected origin surfaces to the caller
 * as an opaque "500 Internal Server Error" if the CORS callback is given an
 * Error, which says nothing about the real cause.
 */

/**
 * Localhost and private addresses: the machine itself and the office LAN.
 *
 * 169.254.x.x (link-local / APIPA) is included because Windows assigns it to
 * an interface with no DHCP lease, and the dashboard is regularly opened on
 * exactly that address while testing. Leaving it out blocked the realtime
 * event stream with a CORS error that retried forever.
 */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * Development tunnels. A phone cannot use the camera over plain HTTP, so
 * testing enrollment on a real device means a tunnel with a public HTTPS
 * name, and its subdomain changes on every restart. Allowed outside
 * production only.
 */
const TUNNEL = /^https:\/\/[a-z0-9-]+\.(ngrok-free\.dev|ngrok\.dev|ngrok-free\.app|ngrok\.app|ngrok\.io|trycloudflare\.com|loca\.lt)$/i;

export function parseFrontendOrigins(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((origin) => origin.trim()).filter(Boolean));
}

export function isAllowedOrigin(
  origin: string | undefined,
  configured: Set<string>,
  isProduction = false,
): boolean {
  // Same-origin and non-browser callers (curl, the AI relay) send no Origin.
  if (!origin) return true;
  if (configured.has(origin)) return true;
  if (LOCAL.test(origin)) return true;
  return !isProduction && TUNNEL.test(origin);
}

export const API_URL = (import.meta.env.VITE_API_BASE_URL
  || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/$/, '');

/** The page is served from this machine, so the backend port is reachable too. */
const ON_LOCALHOST = ['localhost', '127.0.0.1', '::1', '[::1]']
  .includes(window.location.hostname);

/**
 * Where long-lived connections (camera streams, the realtime event stream) go.
 *
 * A browser allows only about six concurrent HTTP/1.1 connections per origin,
 * and an MJPEG stream holds one for as long as it is on screen. With
 * everything on a single origin, a handful of cameras plus the event stream
 * consumed the whole budget and the page could no longer fetch anything --
 * including its own document on reload. Giving streams a second origin gives
 * them their own pool.
 *
 * That second origin is only usable when the page is served from this
 * machine. Opened over a LAN address or a tunnel, the backend port is a
 * different origin that is usually firewalled off and sends no CORS headers,
 * so the event stream is refused and retries forever. In that case
 * everything goes same-origin through the proxy, which always works, and
 * MAX_CONCURRENT_STREAMS is what protects the connection budget instead.
 */
export const STREAM_URL = (() => {
  const configured = import.meta.env.VITE_STREAM_BASE_URL?.trim();
  if (configured && ON_LOCALHOST) return configured.replace(/\/$/, '');
  if (ON_LOCALHOST && import.meta.env.VITE_API_BASE_URL?.startsWith('/')) {
    return `${window.location.protocol}//${window.location.hostname}:3000/api`;
  }
  return API_URL;
})();

/** True when streams have an origin of their own and cannot starve the app. */
export const STREAMS_ARE_SEPARATE = STREAM_URL !== API_URL;

export async function apiFetch(path, options = {}) {
  const session = JSON.parse(localStorage.getItem('stmc_session') || 'null');
  const headers = new Headers(options.headers);
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && path !== '/users/login') {
    localStorage.removeItem('stmc_session');
    window.dispatchEvent(new Event('stmc:unauthorized'));
  }
  return response;
}

export function apiUrl(path) {
  return `${API_URL}${path}`;
}

/** URL for a never-ending response: a camera stream or the event stream. */
export function streamUrl(path) {
  return `${STREAM_URL}${path}`;
}

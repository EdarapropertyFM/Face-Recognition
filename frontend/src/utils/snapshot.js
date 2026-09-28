import { API_URL } from '../api';

/**
 * Where to fetch the face image saved with a detection.
 *
 * The token travels in the URL rather than an Authorization header because
 * these are loaded by <img src="...">, which cannot send headers. It is
 * short-lived and signed by the backend, not a public path: these are face
 * images, so a guessable URL would expose biometric data.
 */
export function snapshotUrl(path, token) {
  if (!path || !token) return '';
  // Each segment is encoded separately so the date/file separator survives.
  const safe = String(path).split('/').map(encodeURIComponent).join('/');
  return `${API_URL}/detections/snapshot/${safe}?token=${encodeURIComponent(token)}`;
}

import { API_URL } from '../api';

/**
 * Links to the images and clip saved with a detection.
 *
 * The token travels in the URL rather than an Authorization header because
 * these are loaded by <img> and <video>, which cannot send headers. It is
 * short-lived and signed by the backend, not a public path: these are face
 * images and footage of people, so a guessable URL would expose them.
 */
function signed(kind, path, token) {
  if (!path || !token) return '';
  // Each segment is encoded separately so the date/file separator survives.
  const safe = String(path).split('/').map(encodeURIComponent).join('/');
  return `${API_URL}/detections/${kind}/${safe}?token=${encodeURIComponent(token)}`;
}

/** The cropped face, for thumbnails in lists. */
export function snapshotUrl(path, token) {
  return signed('snapshot', path, token);
}

/** The full frame, and the clip covering the seconds either side. */
export function evidenceUrl(path, token) {
  return signed('evidence', path, token);
}

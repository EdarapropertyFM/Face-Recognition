/**
 * Persisting a half-finished registration so a closed tab can be resumed.
 *
 * The form takes several minutes and five camera captures. Losing it to an
 * accidental close means retaking every photo, so the step, the captures and
 * the AI person id are saved alongside the text fields.
 *
 * The captures are base64 JPEGs — roughly 60 KB each, so about 300 KB for a
 * full set. That fits in localStorage (~5 MB), but a quota error must never
 * break the form, so every write is guarded.
 */

export const DRAFT_STORAGE_KEY = 'stmc.enrollment.draft.v1';

/** A saved draft older than this is ignored: stale face photos are worse than none. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readStoredDraft(now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return null;
    if (typeof saved.savedAt === 'number' && now - saved.savedAt > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;                       // corrupt or storage blocked
  }
}

export function writeStoredDraft(payload, now = Date.now()) {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...payload, savedAt: now }));
    return true;
  } catch {
    // Private browsing, disabled storage, or the quota is full. The form must
    // keep working; the applicant simply cannot resume later.
    return false;
  }
}

export function clearStoredDraft() {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch { /* nothing to do */ }
}

/** Only the captures we can actually restore: each needs its image. */
export function sanitizeStoredCaptures(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((capture) => capture && typeof capture === 'object'
      && typeof capture.image === 'string' && capture.image.startsWith('data:image/')
      && typeof capture.key === 'string')
    // Three poses (front, left, right); older five-photo drafts keep the first three.
    .slice(0, 3);
}

/**
 * Does this saved draft hold enough to be worth offering as a resume?
 * A draft with nothing but an empty form is noise.
 */
export function isResumable(saved) {
  if (!saved) return false;
  const hasText = Boolean(saved.name?.trim() || saved.nid?.trim() || saved.unit?.trim());
  const hasCaptures = sanitizeStoredCaptures(saved.faceCaptures).length > 0;
  return hasText || hasCaptures;
}

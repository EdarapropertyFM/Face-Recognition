/**
 * Was this error just the client going away?
 *
 * An MJPEG tile is aborted every time a viewer navigates away, collapses a
 * DVR group or reloads the page. That is ordinary traffic, not a fault, so it
 * must be told apart from a real upstream failure — otherwise the log fills
 * with stack traces and a genuine camera problem is impossible to spot.
 *
 * undici reports it as a DOMException named 'AbortError', but a wrapping
 * TypeError can carry it as `cause`, so check both.
 */
export function isAbort(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, code, cause } = error as { name?: string; code?: string; cause?: unknown };
  if (name === 'AbortError' || code === 'ABORT_ERR' || code === 'ECONNRESET') return true;
  return cause !== undefined && cause !== error && isAbort(cause);
}

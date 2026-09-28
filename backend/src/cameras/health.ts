/**
 * How much to trust a camera's stored status.
 *
 * `status` is only written when someone runs "Test connection" — nothing
 * expires it. A camera tested once on Monday still read "online" on Thursday
 * with the DVR unplugged, so the wall promised feeds that could not exist.
 *
 * A heartbeat older than STALE_AFTER_MS means we simply do not know any more,
 * which is different from knowing the camera is down.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;   // 10 minutes

export type CameraHealth = 'online' | 'offline' | 'unknown';

export function healthOf(
  camera: { status?: string | null; lastHeartbeat?: string | null },
  now: number = Date.now(),
): CameraHealth {
  if (camera.status === 'offline') return 'offline';      // a real, observed failure
  if (camera.status !== 'online') return 'unknown';

  const beat = camera.lastHeartbeat ? Date.parse(camera.lastHeartbeat) : NaN;
  if (Number.isNaN(beat)) return 'unknown';               // claims online, never proved it
  return now - beat > STALE_AFTER_MS ? 'unknown' : 'online';
}

/** Whether the stored status is too old to repeat to an operator. */
export function isStale(lastHeartbeat?: string | null, now: number = Date.now()): boolean {
  const beat = lastHeartbeat ? Date.parse(lastHeartbeat) : NaN;
  if (Number.isNaN(beat)) return true;
  return now - beat > STALE_AFTER_MS;
}

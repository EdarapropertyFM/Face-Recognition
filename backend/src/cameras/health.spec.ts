import { STALE_AFTER_MS, healthOf, isStale } from './health';

const now = Date.parse('2026-09-27T10:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('healthOf', () => {
  it('trusts a recent heartbeat', () => {
    expect(healthOf({ status: 'online', lastHeartbeat: ago(60_000) }, now)).toBe('online');
  });

  it('stops claiming online once the heartbeat goes stale', () => {
    // The real case: tested on the 24th, still reported "online" on the 27th
    // while the DVR was unplugged.
    expect(healthOf({ status: 'online', lastHeartbeat: ago(3 * 24 * 3600_000) }, now)).toBe('unknown');
    expect(healthOf({ status: 'online', lastHeartbeat: ago(STALE_AFTER_MS + 1000) }, now)).toBe('unknown');
  });

  it('keeps an observed failure as offline, however old', () => {
    // "I checked and it was broken" is information; it does not decay to
    // "I do not know" the way an old success does.
    expect(healthOf({ status: 'offline', lastHeartbeat: ago(9e9) }, now)).toBe('offline');
  });

  it('is unknown when it claims online but never proved it', () => {
    expect(healthOf({ status: 'online', lastHeartbeat: null }, now)).toBe('unknown');
    expect(healthOf({ status: 'online', lastHeartbeat: 'not a date' }, now)).toBe('unknown');
  });

  it('is unknown for a camera never tested', () => {
    expect(healthOf({ status: 'unconfigured', lastHeartbeat: null }, now)).toBe('unknown');
    expect(healthOf({}, now)).toBe('unknown');
  });
});

describe('isStale', () => {
  it('treats a missing or unparseable heartbeat as stale', () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale('whenever', now)).toBe(true);
  });

  it('is false just inside the window and true just outside', () => {
    expect(isStale(ago(STALE_AFTER_MS - 1000), now)).toBe(false);
    expect(isStale(ago(STALE_AFTER_MS + 1000), now)).toBe(true);
  });
});

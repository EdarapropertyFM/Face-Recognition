import {
  ABANDONED_CAPTURE_TTL_MS, GalleryPerson, PROVISIONAL_ROLE,
  abandonedCaptures, canReuseCapture, isDuplicateMatch, isReleasable,
} from './capture-lifecycle';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const person = (over: Partial<GalleryPerson>): GalleryPerson => ({
  person_id: 'p1', name: 'Pending registration', role: PROVISIONAL_ROLE,
  created_at: ago(ABANDONED_CAPTURE_TTL_MS + 60_000), template_count: 5, ...over,
});

describe('abandonedCaptures', () => {
  // A face enters the gallery before the form is submitted, so an abandoned
  // wizard would otherwise leave biometric data with no owner record.
  it('collects an old, unclaimed provisional capture', () => {
    expect(abandonedCaptures([person({})], new Set(), NOW).map((p) => p.person_id)).toEqual(['p1']);
  });

  it('keeps a capture still inside the grace period', () => {
    const fresh = person({ created_at: ago(60_000) });
    expect(abandonedCaptures([fresh], new Set(), NOW)).toEqual([]);
  });

  it('keeps a capture claimed by an enrollment or a face', () => {
    expect(abandonedCaptures([person({})], new Set(['p1']), NOW)).toEqual([]);
  });

  it('never touches an enrolled resident, however old', () => {
    const resident = person({ person_id: 'r1', role: 'resident', created_at: ago(365 * 864e5) });
    expect(abandonedCaptures([resident], new Set(), NOW)).toEqual([]);
  });

  it('sorts through a mixed gallery', () => {
    const got = abandonedCaptures([
      person({ person_id: 'stale' }),
      person({ person_id: 'claimed' }),
      person({ person_id: 'fresh', created_at: ago(1000) }),
      person({ person_id: 'resident', role: 'resident' }),
    ], new Set(['claimed']), NOW);
    expect(got.map((p) => p.person_id)).toEqual(['stale']);
  });
});

describe('isDuplicateMatch', () => {
  it('blocks a confirmed match against somebody else', () => {
    expect(isDuplicateMatch('confirmed', 'other', 'mine')).toBe(true);
    expect(isDuplicateMatch('confirmed', 'other', undefined)).toBe(true);
  });

  it('allows the applicant matching their own capture', () => {
    expect(isDuplicateMatch('confirmed', 'mine', 'mine')).toBe(false);
  });

  it('never refuses on a tentative or unknown decision', () => {
    expect(isDuplicateMatch('tentative', 'other', undefined)).toBe(false);
    expect(isDuplicateMatch('unknown', undefined, undefined)).toBe(false);
  });
});

describe('canReuseCapture', () => {
  it('reuses a capture that still holds templates', () => {
    expect(canReuseCapture(person({ template_count: 5 }))).toBe(true);
  });

  it('re-enrolls when the capture was purged, or holds nothing', () => {
    expect(canReuseCapture(undefined)).toBe(false);
    expect(canReuseCapture(person({ template_count: 0 }))).toBe(false);
  });
});

describe('isReleasable', () => {
  const hour = 60 * 60 * 1000;
  const now = 1_790_000_000_000;
  const at = (ms: number) => ({ created_at: new Date(ms).toISOString() });

  it('clears an entry nothing refers to once it is genuinely old', () => {
    expect(isReleasable(at(now - 3 * hour), false, now)).toBe(true);
  });

  it('protects a capture made moments ago', () => {
    // The exact failure: a household being enrolled right now is unreferenced
    // until submit, so the son's capture deleted the owner instead of being
    // refused as a duplicate.
    expect(isReleasable(at(now - 30 * 1000), false, now)).toBe(false);
    expect(isReleasable(at(now - 1.9 * hour), false, now)).toBe(false);
  });

  it('never clears an entry something still refers to', () => {
    expect(isReleasable(at(now - 99 * hour), true, now)).toBe(false);
  });

  it('never clears an entry of unknown age', () => {
    expect(isReleasable({ created_at: 'not a date' }, false, now)).toBe(false);
    expect(isReleasable(null, false, now)).toBe(false);
  });
});

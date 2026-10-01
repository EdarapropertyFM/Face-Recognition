import { rangeOf, everyDay, rangeBetween } from './analytics-range';

describe('analytics range', () => {
  it('ends on today, so the current day is never missing from the chart', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(everyDay(rangeOf(30)).at(-1)).toBe(today);
  });

  it('returns exactly the requested number of day buckets', () => {
    expect(everyDay(rangeOf(1))).toHaveLength(1);
    expect(everyDay(rangeOf(7))).toHaveLength(7);
    expect(everyDay(rangeOf(90))).toHaveLength(90);
  });

  it('clamps a nonsense window instead of querying the whole table', () => {
    expect(rangeOf(0).days).toBe(30);
    expect(rangeOf(-5).days).toBe(1);
    expect(rangeOf(9999).days).toBe(365);
    expect(rangeOf(Number.NaN).days).toBe(30);
  });

  it('covers whole UTC days, matching how the SQL slices the timestamp', () => {
    const range = rangeOf(3);
    expect(range.from).toMatch(/T00:00:00\.000Z$/);
    expect(range.to).toMatch(/T23:59:59\.999Z$/);
  });
});

describe('explicit date window', () => {
  /** Narrows the nullable return so the assertions read plainly. */
  const window = (from?: string, to?: string) => {
    const range = rangeBetween(from, to);
    if (!range) throw new Error('expected a window');
    return range;
  };

  it('covers whole UTC days between the two dates, inclusive', () => {
    const range = window('2026-09-01', '2026-09-03');
    expect(range.days).toBe(3);
    expect(everyDay(range)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('reads a single day as that one day', () => {
    expect(everyDay(window('2026-10-01', '2026-10-01'))).toEqual(['2026-10-01']);
  });

  it('fills in a missing bound rather than returning nothing', () => {
    expect(window('2026-10-01', undefined).days).toBe(1);
    expect(window(undefined, '2026-10-01').days).toBe(1);
  });

  it('swaps a reversed pair instead of producing an empty window', () => {
    expect(everyDay(window('2026-09-03', '2026-09-01')))
      .toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('falls back to the preset when no window is given or it is absurd', () => {
    expect(rangeBetween(undefined, undefined)).toBeNull();
    expect(rangeBetween('2020-01-01', '2026-01-01')).toBeNull();
  });
});

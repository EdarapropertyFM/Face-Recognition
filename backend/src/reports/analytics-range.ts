/**
 * Date-window maths for the analytics report, kept free of Nest and TypeORM
 * imports so it can be unit-tested directly (the same reason
 * `household-rules.ts` sits apart from its service).
 */
export type AnalyticsRange = { days: number; from: string; to: string };

const DAY_MS = 86_400_000;

/**
 * Boundaries are whole UTC days, because the SQL groups on a substring of
 * the stored ISO timestamp, which is UTC. Using local midnight here instead
 * shifted the window by the timezone offset and dropped today's sightings
 * off the end of the chart.
 */
export function rangeOf(days: number): AnalyticsRange {
  const safe = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  const now = new Date();
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    days: safe,
    from: new Date(startOfToday - (safe - 1) * DAY_MS).toISOString(),
    to: new Date(startOfToday + DAY_MS - 1).toISOString(),
  };
}

/** Every day in the range, so a quiet day is a zero rather than a gap. */
export function everyDay(range: AnalyticsRange): string[] {
  const days: string[] = [];
  for (let at = Date.parse(range.from); at <= Date.parse(range.to); at += DAY_MS) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * An explicit window, from the first instant of `from` to the last of `to`,
 * in UTC for the same reason as rangeOf. Either bound may be omitted; a
 * reversed pair is swapped rather than returning nothing.
 */
export function rangeBetween(from?: string, to?: string): AnalyticsRange | null {
  const startOf = (iso?: string) => {
    const at = Date.parse(`${String(iso ?? '').slice(0, 10)}T00:00:00.000Z`);
    return Number.isFinite(at) ? at : null;
  };
  let a = startOf(from);
  let b = startOf(to);
  if (a === null && b === null) return null;
  a ??= b;
  b ??= a;
  if ((a as number) > (b as number)) [a, b] = [b, a];

  const span = Math.round(((b as number) - (a as number)) / DAY_MS) + 1;
  if (span > 366) return null;   // guard: the UI offers nothing this wide
  return {
    days: span,
    from: new Date(a as number).toISOString(),
    to: new Date((b as number) + DAY_MS - 1).toISOString(),
  };
}

/**
 * Code generators for bulk-adding buildings and units.
 *
 * Everything here is pure and the panel previews the result before anything
 * is sent, so what an admin sees listed is exactly what gets created. The
 * API is given the finished list, never a pattern -- a pattern the server
 * expands differently from the preview is a trap.
 */

export const MAX_GENERATED = 2000;

const pad = (value, width) => String(value).padStart(Number(width) || 0, '0');

/** "A" + 1..3 -> ["A1","A2","A3"]; width 2 -> ["A01","A02","A03"]. */
export function expandRange({ prefix = '', from = 1, to = 1, width = 0, suffix = '' } = {}) {
  const start = Math.trunc(Number(from));
  const end = Math.trunc(Number(to));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const step = start <= end ? 1 : -1;
  const codes = [];
  for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
    codes.push(`${prefix}${pad(Math.abs(n), width)}${suffix}`);
    if (codes.length >= MAX_GENERATED) break;
  }
  return codes;
}

/**
 * Floor-based unit codes: 3 floors x 4 units with separator "-" gives
 * 1-01 … 3-04. With no separator they read 101 … 304, which is how most
 * buildings here actually number their doors.
 */
export function expandFloors({ floors = 1, perFloor = 1, firstFloor = 1, separator = '', width = 2 } = {}) {
  const total = Math.trunc(Number(floors));
  const each = Math.trunc(Number(perFloor));
  const first = Math.trunc(Number(firstFloor));
  if (!(total > 0) || !(each > 0)) return [];
  const codes = [];
  for (let floor = first; floor < first + total; floor += 1) {
    for (let unit = 1; unit <= each; unit += 1) {
      codes.push(`${floor}${separator}${pad(unit, width)}`);
      if (codes.length >= MAX_GENERATED) return codes;
    }
  }
  return codes;
}

/** Free text: one per line, or comma/space separated. */
export function expandList(text = '') {
  return [...new Set(
    String(text).split(/[\n,;\t]+/).map((entry) => entry.trim()).filter(Boolean),
  )].slice(0, MAX_GENERATED);
}

/** What a generator produced, minus anything that already exists. */
export function splitExisting(codes, existing = []) {
  const have = new Set(existing);
  const fresh = [];
  const duplicates = [];
  for (const code of codes) {
    if (have.has(code) || fresh.includes(code)) duplicates.push(code);
    else fresh.push(code);
  }
  return { fresh, duplicates };
}

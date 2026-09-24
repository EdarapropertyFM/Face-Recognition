import { ZONES } from '../store';

/**
 * Safe lookups for values that arrive from the API.
 *
 * A zone number or a face record comes from cameras, detections and the AI
 * relay, none of which are limited to the zones this build happens to know
 * about. Indexing straight into ZONES, or reading `.name[lang]` on a record
 * whose name is missing, throws a TypeError during render — which React turns
 * into a blank page via the error boundary, losing the whole screen because
 * one row had an unexpected value.
 */

/** Zone label, falling back to the raw number rather than crashing. */
export function zoneLabel(zone, lang = 0) {
  const known = ZONES[zone];
  if (known) return known[lang] ?? known[0];
  return zone === undefined || zone === null ? '—' : `Zone ${zone}`;
}

/**
 * Bilingual name off any record ({ name: [en, ar] }), with a fallback.
 * Tolerates a missing record, a missing name, and a name stored as a plain
 * string instead of a pair.
 */
export function displayName(record, lang = 0, fallback = '') {
  const name = record?.name;
  if (typeof name === 'string') return name || fallback;
  if (Array.isArray(name)) return name[lang] ?? name[0] ?? fallback;
  return fallback;
}

/**
 * DEMO MODE — presentation data for showing the system before go-live.
 *
 * Switched by VITE_DEMO_DATA=true in frontend/.env. When it is off (or this
 * file is deleted together with its imports) every page reads the real API.
 * The data is shaped exactly like the API responses, so the pages render it
 * through the same code they use for live data.
 */
import { FACES, DETECTIONS, ZONES, NOW } from './store';

export const DEMO = import.meta.env.VITE_DEMO_DATA === 'true';

// Shift the demo timeline so the latest sighting was a few minutes ago.
const SHIFT = Date.now() - NOW.getTime() - 3 * 60000;
const BUILDING_BY_ZONE = ['WTR-B1', 'WTR-B2', 'WTR-B5', 'Main Gate', 'Clubhouse', 'WTR-B3'];

function camera(d) {
  const channel = (Number(d.cam.match(/(\d+)$/)?.[1]) % 16) + 1;
  return { id: d.cam, name: `${ZONES[d.zone]?.[0] ?? 'Camera'} ${channel}`, building: BUILDING_BY_ZONE[d.zone] ?? null, channel };
}

function subject(face) {
  const known = face.type !== 'unknown';
  return {
    id: face.id, known, type: face.type,
    name: known ? face.name : ['Stranger', 'غريب'],
    role: face.role, idno: face.idno, enroll: face.enroll,
    bldg: face.bldg !== '—' ? face.bldg : null, unit: face.unit !== '—' ? face.unit : null,
  };
}

const detections = DETECTIONS.map((d, i) => ({
  id: `demo-${i}`, face: d.face, cam: d.cam, zone: d.zone, conf: d.conf, type: d.type,
  decision: d.type === 'unknown' ? 'unknown' : 'match',
  when: new Date(d.ts + SHIFT).toISOString(),
  camera: camera(d),
}));

const byFace = (id) => detections.filter((d) => d.face === id);

/** Alerts page: one notification per person per camera, as the live system raises them. */
export function demoAlerts() {
  const seen = new Set();
  return detections.filter((d) => {
    const key = `${d.face}|${d.cam}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 14).map((d, i) => ({
    id: `DEMO-A${i + 1}`, face: d.face, cam: d.cam, zone: d.zone, when: d.when, conf: d.conf,
    log: [['ai', 'CREATED', d.when]],
    subject: subject(FACES.find((f) => f.id === d.face)), camera: d.camera,
  }));
}

/** Track & Trace person picker. */
export function demoSubjects() {
  return FACES.map((f) => ({ ...subject(f), count: byFace(f.id).length, last: byFace(f.id)[0]?.when ?? null }))
    .sort((a, b) => String(b.last ?? '').localeCompare(String(a.last ?? '')));
}

/** Track & Trace history for one person. */
export function demoHistory(id) {
  const face = FACES.find((f) => f.id === id);
  if (!face) return null;
  const rows = byFace(id);
  return { subject: subject(face), total: rows.length, detections: rows };
}

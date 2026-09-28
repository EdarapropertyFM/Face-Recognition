import { Face } from '../faces/entities/face.entity';
import { Camera } from '../cameras/entities/camera.entity';

/**
 * Strangers have no face record, so something stands in for one.
 *
 * Preferred is `strangerKey`, which the AI derives from the face itself by
 * comparing it with other recent unknown faces. The fallback is the tracker's
 * track id, which is far weaker: a track ends whenever the face is lost for a
 * moment, so one person walking around a lobby once produced sixty-three
 * separate "strangers". The key is not camera-scoped, because somebody who
 * passes the gate and then the lobby is one person.
 */
export function strangerId(
  cam: string,
  trackId: unknown,
  when: string,
  strangerKey?: unknown,
): string | null {
  const key = typeof strangerKey === 'string' ? strangerKey.trim() : '';
  if (key) return `S-${key}`;
  if (trackId === undefined || trackId === null || trackId === '') return null;
  return `S-${cam}-${String(trackId)}-${when.slice(0, 10).replaceAll('-', '')}`;
}

export function isStrangerId(id: string | null | undefined): boolean {
  return !id || id === 'unknown' || id.startsWith('S-');
}

/** Who an alert or detection is about, safe to send to the browser. */
export function describeSubject(id: string | null | undefined, face?: Face | null) {
  if (face) {
    return {
      id: face.id, known: true, type: face.type, name: face.name, role: face.role,
      idno: face.idno, enroll: face.enroll, bldg: face.bldg ?? null, unit: face.unit ?? null,
      aiPersonId: face.aiPersonId ?? null,
    };
  }
  if (id === 'motion') {
    return {
      id, known: false, type: 'motion', name: ['Movement detected', 'حركة'], role: ['No face visible', 'لا يظهر وجه'],
      idno: null, enroll: null, bldg: null, unit: null, aiPersonId: null,
    };
  }
  return {
    id: id ?? 'unknown', known: false, type: 'unknown',
    name: ['Stranger', '\u063a\u0631\u064a\u0628'], role: ['Not in database', '\u063a\u064a\u0631 \u0645\u0633\u062c\u0644'],
    idno: null, enroll: null, bldg: null, unit: null, aiPersonId: null,
  };
}

/** Where: the camera's display name, building and DVR channel. */
export function describeCamera(id: string, cam?: Camera | null) {
  return {
    id,
    name: cam?.displayName || id,
    building: cam?.buildingCode ?? null,
    project: cam?.project ?? null,
    location: cam?.location ?? null,
    channel: cam?.channel ?? null,
  };
}

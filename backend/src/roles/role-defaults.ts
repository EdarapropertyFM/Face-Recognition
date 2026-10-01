/**
 * The permission set a fresh install starts from, and the shape every role
 * is validated against. Editing the matrix changes the stored rows, never
 * this file.
 */
export const MODULES = [
  'dashboard', 'livewall', 'cameras', 'units', 'enrollments', 'alerts',
  'track', 'facedb', 'reports', 'facetest', 'admin', 'settings',
] as const;

export type ModuleKey = (typeof MODULES)[number];

const ALL = [...MODULES];

export const ROLE_DEFAULTS: Record<string, { view: string[]; edit: string[] }> = {
  Admin: { view: ALL, edit: ALL },
  Supervisor: {
    view: ['dashboard', 'livewall', 'cameras', 'units', 'enrollments', 'alerts', 'track', 'facedb', 'reports', 'settings'],
    edit: ['alerts', 'facedb', 'enrollments'],
  },
  Operator: {
    view: ['dashboard', 'livewall', 'cameras', 'units', 'enrollments', 'alerts', 'track', 'facedb'],
    edit: ['alerts'],
  },
  Investigator: {
    view: ['dashboard', 'units', 'track', 'facedb', 'reports'],
    edit: ['facedb'],
  },
  Viewer: {
    view: ['dashboard', 'livewall', 'cameras', 'units', 'reports'],
    edit: [],
  },
};

/**
 * Admin keeps every module no matter what is sent. An admin who edits
 * themselves out of the Admin module locks the matrix away from everyone,
 * and there is no screen left to undo it from.
 */
export const LOCKED_ROLE = 'Admin';

/** Editing implies viewing, so an edit grant carries its view grant with it. */
export function normalizePermissions(view: string[] = [], edit: string[] = []) {
  const valid = (keys: string[]) => keys.filter((key) => (MODULES as readonly string[]).includes(key));
  const edits = [...new Set(valid(edit))];
  const views = [...new Set([...valid(view), ...edits])];
  return {
    view: (MODULES as readonly string[]).filter((key) => views.includes(key)),
    edit: (MODULES as readonly string[]).filter((key) => edits.includes(key)),
  };
}

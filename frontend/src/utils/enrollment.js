import { nationalIdError } from './nationalId';
import { MAX_AGE, requiresNationalId } from './household';

export const EMPTY_ENROLLMENT_DRAFT = Object.freeze({
  building: '', unit: '', name: '', age: '', nid: '', mobile: '', email: '', idDocName: '',
  // Compressed data URL of the ID card, so a resumed draft is still complete.
  idDocImage: '', family: [], cars: [], residences: [],
});

/** A resident may hold several units, in different buildings or projects. */
export function newResidence() {
  return { id: crypto.randomUUID(), project: '', building: '', unit: '' };
}

export function buildingsInProject(projectName, projects) {
  return projects.find((project) => project.project === projectName)?.buildings ?? [];
}

export function unitsInBuilding(projectName, buildingCode, projects) {
  return buildingsInProject(projectName, projects)
    .find((building) => building.code === buildingCode)?.units ?? [];
}

/** The residences a draft holds, always at least one row for the form. */
export function draftResidences(draft) {
  return draft.residences?.length ? draft.residences : [newResidence()];
}

export function residenceProblems(residences, projects) {
  const problems = {};
  const seen = new Set();
  residences.forEach((residence, index) => {
    if (!projects.some((project) => project.project === residence.project)) {
      problems[index] = 'Choose a valid project.';
      return;
    }
    if (!buildingsInProject(residence.project, projects).some((b) => b.code === residence.building)) {
      problems[index] = 'Choose a valid building.';
      return;
    }
    if (!unitsInBuilding(residence.project, residence.building, projects).includes(residence.unit)) {
      problems[index] = 'Choose a valid unit.';
      return;
    }
    const key = `${residence.project}|${residence.building}|${residence.unit}`;
    if (seen.has(key)) problems[index] = 'This unit is already listed.';
    seen.add(key);
  });
  return problems;
}

export function sanitizeStoredDraft(value) {
  if (!value || typeof value !== 'object') return { ...EMPTY_ENROLLMENT_DRAFT };
  return Object.keys(EMPTY_ENROLLMENT_DRAFT).reduce((draft, key) => {
    if (key === 'family' || key === 'cars') {
      draft[key] = Array.isArray(value[key])
        ? value[key].filter((entry) => entry && typeof entry === 'object').map((entry) => ({ ...entry, id: entry.id || crypto.randomUUID() }))
        : [];
    }
    else if (key === 'residences') {
      draft[key] = Array.isArray(value[key])
        ? value[key]
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => ({
            id: entry.id || crypto.randomUUID(),
            project: typeof entry.project === 'string' ? entry.project : '',
            building: typeof entry.building === 'string' ? entry.building : '',
            unit: typeof entry.unit === 'string' ? entry.unit : '',
          }))
        : [];
    }
    else draft[key] = typeof value[key] === 'string' ? value[key] : '';
    return draft;
  }, {});
}

export function validateResidenceDraft(draft, identityDocument, projects) {
  const errors = {};
  const residences = draftResidences(draft);
  const problems = residenceProblems(residences, projects);
  if (Object.keys(problems).length) errors.residences = problems;
  if (draft.name.trim().length < 3) errors.name = 'Enter your full name.';
  const years = Number(draft.age);
  if (String(draft.age ?? '').trim() === '') errors.age = 'Enter your age.';
  else if (!Number.isInteger(years) || years < 0 || years > MAX_AGE) errors.age = `Enter an age between 0 and ${MAX_AGE}.`;

  // A National ID only exists from 16, so it is asked for only then. When it
  // is given, the date of birth encoded in it must also be 16+, which catches
  // someone entering an age that does not match their ID.
  if (requiresNationalId(draft.age)) {
    const nidProblem = nationalIdError(draft.nid);
    if (nidProblem) errors.nid = nidProblem;
  }
  if (!/^01[0125]\d{8}$/.test(draft.mobile)) errors.mobile = 'Enter a valid Egyptian mobile number.';
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) errors.email = 'Enter a valid email address.';
  // Only asked for from 16, and a resumed draft has it as a stored image
  // rather than a File.
  if (!requiresNationalId(draft.age)) { /* no ID card below 16 */ }
  else if (!identityDocument) {
    if (!draft.idDocImage) errors.idDoc = 'Upload your National ID card.';
  }
  else if (!['image/jpeg', 'image/png', 'image/webp'].includes(identityDocument.type)) errors.idDoc = 'Use a JPG, PNG or WebP image.';
  else if (identityDocument.size > 5 * 1024 * 1024) errors.idDoc = 'The image must be 5 MB or smaller.';
  return errors;
}

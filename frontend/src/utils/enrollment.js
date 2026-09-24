import { nationalIdError } from './nationalId';
import { MAX_AGE, requiresNationalId } from './household';

export const EMPTY_ENROLLMENT_DRAFT = Object.freeze({
  building: '', unit: '', name: '', age: '', nid: '', mobile: '', email: '', idDocName: '',
  // Compressed data URL of the ID card, so a resumed draft is still complete.
  idDocImage: '', family: [], cars: [],
});

export function getUnitsForBuilding(buildingCode, buildings) {
  return buildings.find((building) => building.code === buildingCode)?.units ?? [];
}

export function sanitizeStoredDraft(value) {
  if (!value || typeof value !== 'object') return { ...EMPTY_ENROLLMENT_DRAFT };
  return Object.keys(EMPTY_ENROLLMENT_DRAFT).reduce((draft, key) => {
    if (key === 'family' || key === 'cars') {
      draft[key] = Array.isArray(value[key])
        ? value[key].filter((entry) => entry && typeof entry === 'object').map((entry) => ({ ...entry, id: entry.id || crypto.randomUUID() }))
        : [];
    }
    else draft[key] = typeof value[key] === 'string' ? value[key] : '';
    return draft;
  }, {});
}

export function validateResidenceDraft(draft, identityDocument, buildings) {
  const errors = {};
  if (!buildings.some((building) => building.code === draft.building)) errors.building = 'Choose a valid building.';
  if (!getUnitsForBuilding(draft.building, buildings).includes(draft.unit)) errors.unit = 'Choose a valid unit.';
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

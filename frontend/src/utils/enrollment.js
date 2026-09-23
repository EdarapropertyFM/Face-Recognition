export const EMPTY_ENROLLMENT_DRAFT = Object.freeze({
  building: '', unit: '', name: '', nid: '', mobile: '', email: '', idDocName: '', family: [], cars: [],
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
  if (!/^\d{14}$/.test(draft.nid)) errors.nid = 'National ID must contain exactly 14 digits.';
  if (!/^01[0125]\d{8}$/.test(draft.mobile)) errors.mobile = 'Enter a valid Egyptian mobile number.';
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) errors.email = 'Enter a valid email address.';
  if (!identityDocument) errors.idDoc = 'Upload your National ID card.';
  else if (!['image/jpeg', 'image/png', 'image/webp'].includes(identityDocument.type)) errors.idDoc = 'Use a JPG, PNG or WebP image.';
  else if (identityDocument.size > 5 * 1024 * 1024) errors.idDoc = 'The image must be 5 MB or smaller.';
  return errors;
}

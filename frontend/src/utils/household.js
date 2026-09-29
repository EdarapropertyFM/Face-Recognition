import { nationalIdError } from './nationalId';

/**
 * Who can be added to a household, and what each of them must provide.
 *
 * Two rules drive the whole form:
 *  - A National ID exists only from 16. Under that age the field is hidden
 *    entirely rather than shown and left blank, so nobody is asked for a
 *    document that does not exist.
 *  - Staff (driver, housekeeper) are recorded without a phone number: the
 *    community has no reason to hold an employee's personal contact details.
 */

export const NATIONAL_ID_MIN_AGE = 16;
export const MAX_AGE = 120;

export const RELATIONS = [
  { value: 'Wife', label: 'Wife', labelAr: 'زوجة', staff: false },
  { value: 'Husband', label: 'Husband', labelAr: 'زوج', staff: false },
  { value: 'Son', label: 'Son', labelAr: 'ابن', staff: false },
  { value: 'Daughter', label: 'Daughter', labelAr: 'ابنة', staff: false },
  { value: 'Driver', label: 'Driver', labelAr: 'سائق', staff: true },
  { value: 'Housekeeper', label: 'Housekeeper', labelAr: 'عاملة منزلية', staff: true },
];

export const RELATION_VALUES = RELATIONS.map((relation) => relation.value);

/** Staff are recorded without a personal phone number. */
export function isStaffRelation(relation) {
  return RELATIONS.find((entry) => entry.value === relation)?.staff === true;
}

/** A National ID only exists from 16, so the field is shown only then. */
export function requiresNationalId(age) {
  const years = Number(age);
  return Number.isFinite(years) && years >= NATIONAL_ID_MIN_AGE;
}

export function collectsMobile(relation) {
  return !isStaffRelation(relation);
}

export function emptyMember() {
  return {
    id: crypto.randomUUID(),
    name: '', relation: '', age: '', nid: '', mobile: '', email: '',
    idDocImage: '', faces: [], aiPersonId: null,
  };
}

function ageError(age) {
  if (String(age ?? '').trim() === '') return 'Enter the age.';
  const years = Number(age);
  if (!Number.isInteger(years) || years < 0 || years > MAX_AGE) return `Enter an age between 0 and ${MAX_AGE}.`;
  return null;
}

/** Field-keyed problems with one household member; empty object means valid. */
export function validateMember(member, { requireFaces = true } = {}) {
  const errors = {};
  if (!member.name || member.name.trim().length < 3) errors.name = 'Enter the full name.';
  if (!RELATION_VALUES.includes(member.relation)) errors.relation = 'Choose a relationship.';

  const badAge = ageError(member.age);
  if (badAge) errors.age = badAge;

  if (!badAge && requiresNationalId(member.age)) {
    const problem = nationalIdError(member.nid);
    if (problem) errors.nid = problem;
    if (!member.idDocImage) errors.idDoc = 'Upload their National ID card.';
  }

  if (collectsMobile(member.relation)) {
    if (!/^01[0125]\d{8}$/.test(member.mobile || '')) errors.mobile = 'Enter a valid Egyptian mobile number.';
  }

  if (member.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (requireFaces && (member.faces?.length ?? 0) < 3) {
    errors.faces = 'Capture the three face photos (front, left, right) for this person.';
  }
  return errors;
}

export function validateMembers(members, options) {
  return members.map((member) => validateMember(member, options));
}

export function membersAreValid(members, options) {
  return validateMembers(members, options).every((errors) => Object.keys(errors).length === 0);
}

/** What the API is sent: the client-only id and raw captures are dropped. */
export function memberPayload(member) {
  const { id: _id, faces, idDocImage, mobile, ...rest } = member;
  void _id;
  return {
    ...rest,
    age: Number(member.age),
    mobile: collectsMobile(member.relation) ? mobile : null,
    nationalIdCard: requiresNationalId(member.age) ? idDocImage || null : null,
    nid: requiresNationalId(member.age) ? member.nid : null,
    faces: Object.fromEntries((faces ?? []).map((capture) => [capture.key, capture.image])),
  };
}

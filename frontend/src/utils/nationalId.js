/**
 * Egyptian National ID: 14 digits, C YYMMDD GG SSSS K
 *
 *   C       century marker — 2 = born 19xx, 3 = born 20xx
 *   YYMMDD  date of birth
 *   GG      governorate code
 *   SSSS    serial (odd = male, even = female)
 *   K       checksum
 *
 * The date of birth is encoded in the number itself, so an age rule needs no
 * extra field on the form and cannot be bypassed by mistyping a birthday.
 */

export const MINIMUM_AGE_YEARS = 16;

/** Date of birth encoded in the ID, or null if the digits are not a real date. */
export function birthDateFromNationalId(nid) {
  if (!/^\d{14}$/.test(nid)) return null;
  const century = { 2: 1900, 3: 2000 }[nid[0]];
  if (!century) return null;

  const year = century + Number(nid.slice(1, 3));
  const month = Number(nid.slice(3, 5));
  const day = Number(nid.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates such as 31 February, which roll over.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** Whole years between the birth date encoded in the ID and `on`. */
export function ageFromNationalId(nid, on = new Date()) {
  const born = birthDateFromNationalId(nid);
  if (!born) return null;
  let age = on.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

/**
 * The problem with a National ID, or null when it is acceptable.
 * Returns a message rather than a boolean so the form can say what is wrong.
 */
export function nationalIdError(nid, { minimumAge = MINIMUM_AGE_YEARS, on } = {}) {
  if (!/^\d{14}$/.test(nid ?? '')) return 'National ID must contain exactly 14 digits.';
  const age = ageFromNationalId(nid, on);
  if (age === null) return 'This National ID does not contain a valid date of birth.';
  if (age < 0) return 'This National ID has a date of birth in the future.';
  if (age < minimumAge) return `Registration is for ages ${minimumAge} and over. This ID belongs to someone aged ${age}.`;
  return null;
}

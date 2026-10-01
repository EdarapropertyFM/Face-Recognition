/**
 * Server-side household rules. The form applies the same logic for the UX,
 * but the API must not trust it: these decide what is actually stored, and
 * they govern biometric data and personal contact details.
 *
 * Two rules shape everything:
 *  - A National ID exists only from 16, so below that age it is neither asked
 *    for nor accepted.
 *  - Staff (driver, housekeeper) are recorded without a phone number: the
 *    community has no reason to hold an employee's personal contact details.
 */

export const NATIONAL_ID_MIN_AGE = 16;
export const MAX_AGE = 120;

export const RELATIONS = ['Wife', 'Husband', 'Son', 'Daughter', 'Driver', 'Housekeeper'] as const;
export type Relation = (typeof RELATIONS)[number];

const STAFF_RELATIONS = new Set<string>(['Driver', 'Housekeeper']);

export function isStaffRelation(relation: string): boolean {
  return STAFF_RELATIONS.has(relation);
}

export function requiresNationalId(age: unknown): boolean {
  return Number.isFinite(Number(age)) && Number(age) >= NATIONAL_ID_MIN_AGE;
}

export function collectsMobile(relation: string): boolean {
  return !isStaffRelation(relation);
}

/**
 * Date of birth encoded in an Egyptian National ID (C YYMMDD GG SSSS K),
 * or null when the digits are not a real date.
 */
export function birthDateFromNationalId(nid: string): Date | null {
  if (!/^\d{14}$/.test(nid)) return null;
  const century = ({ '2': 1900, '3': 2000 } as Record<string, number>)[nid[0]];
  if (!century) return null;
  const year = century + Number(nid.slice(1, 3));
  const month = Number(nid.slice(3, 5));
  const day = Number(nid.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function ageFromNationalId(nid: string, on = new Date()): number | null {
  const born = birthDateFromNationalId(nid);
  if (!born) return null;
  let age = on.getUTCFullYear() - born.getUTCFullYear();
  const months = on.getUTCMonth() - born.getUTCMonth();
  if (months < 0 || (months === 0 && on.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

export function nationalIdProblem(nid: string | null | undefined, on?: Date): string | null {
  if (!/^\d{14}$/.test(nid ?? '')) return 'National ID must contain exactly 14 digits';
  const age = ageFromNationalId(nid as string, on);
  if (age === null) return 'National ID does not contain a valid date of birth';
  if (age < NATIONAL_ID_MIN_AGE) return `National ID belongs to someone aged ${age}; registration is ${NATIONAL_ID_MIN_AGE}+`;
  return null;
}

export type HouseholdMemberInput = {
  name?: string;
  relation?: string;
  age?: number | string;
  nid?: string | null;
  mobile?: string | null;
  email?: string | null;
  nationalIdCard?: string | null;
  faces?: Record<string, string>;
  aiPersonId?: string | null;
};

/** Human-readable problems with one member; empty means acceptable. */
export function householdMemberProblems(
  member: HouseholdMemberInput, index: number, on?: Date,
): string[] {
  const where = `Person ${index + 1}`;
  const problems: string[] = [];

  if (!member.name || member.name.trim().length < 3) problems.push(`${where}: enter a full name`);
  if (!RELATIONS.includes(member.relation as Relation)) {
    problems.push(`${where}: relationship must be one of ${RELATIONS.join(', ')}`);
  }

  const age = Number(member.age);
  if (!Number.isInteger(age) || age < 0 || age > MAX_AGE) {
    problems.push(`${where}: age must be a whole number between 0 and ${MAX_AGE}`);
  } else if (requiresNationalId(age)) {
    const problem = nationalIdProblem(member.nid, on);
    if (problem) problems.push(`${where}: ${problem}`);
    if (!member.nationalIdCard) problems.push(`${where}: a National ID card image is required from ${NATIONAL_ID_MIN_AGE}`);
  } else if (member.nid) {
    // Below 16 there is no National ID to hold, so refuse to store one.
    problems.push(`${where}: under ${NATIONAL_ID_MIN_AGE} must not have a National ID`);
  }

  if (member.relation && collectsMobile(member.relation)) {
    if (!/^01[0125]\d{8}$/.test(member.mobile ?? '')) problems.push(`${where}: enter a valid Egyptian mobile number`);
  } else if (member.relation && member.mobile) {
    problems.push(`${where}: a ${member.relation.toLowerCase()} is recorded without a phone number`);
  }

  if (member.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) {
    problems.push(`${where}: enter a valid email address`);
  }

  const faces = Object.values(member.faces ?? {});
  if (faces.length < 3) problems.push(`${where}: all three face photos (front, left, right) are required`);
  else if (!faces.every((image) => typeof image === 'string' && image.startsWith('data:image/'))) {
    problems.push(`${where}: face photos must be camera captures`);
  }
  return problems;
}

export function householdProblems(members: HouseholdMemberInput[] | undefined, on?: Date): string[] {
  return (members ?? []).flatMap((member, index) => householdMemberProblems(member, index, on));
}

/** What is safe to persist: staff phone numbers and under-16 IDs are dropped. */
export function normalizeMember(member: HouseholdMemberInput) {
  const age = Number(member.age);
  const keepsId = requiresNationalId(age);
  return {
    name: (member.name ?? '').trim(),
    relation: member.relation as Relation,
    age,
    nid: keepsId ? member.nid ?? null : null,
    mobile: collectsMobile(member.relation ?? '') ? member.mobile ?? null : null,
    email: member.email?.trim() || null,
    nationalIdCard: keepsId ? member.nationalIdCard ?? null : null,
    aiPersonId: member.aiPersonId ?? null,
  };
}

/** Digits only, so "2850101 01234 5" and "285010101234 5" are one identity. */
export function normalizeNationalId(nid: unknown): string {
  return String(nid ?? '').replace(/\D/g, '');
}

export type IdentityHolder = { label: string; nid: string };

/**
 * Everyone a submission claims to be, owner first. Members under 16 carry no
 * National ID, so they contribute nothing to compare.
 */
export function identitiesInSubmission(
  owner: Record<string, unknown> | undefined,
  members: HouseholdMemberInput[] | undefined,
): IdentityHolder[] {
  const holders: IdentityHolder[] = [];
  const ownerNid = normalizeNationalId(owner?.nid);
  if (ownerNid) {
    holders.push({ label: String(owner?.name ?? '').trim() || 'the owner', nid: ownerNid });
  }
  (members ?? []).forEach((member, index) => {
    const nid = normalizeNationalId(member.nid);
    if (nid) holders.push({ label: member.name?.trim() || `person ${index + 1}`, nid });
  });
  return holders;
}

/**
 * One National ID belongs to one human being. Nothing stopped an owner from
 * reusing his own ID for his son, which produced two people sharing one
 * identity: the same ID would then match two faces, and any lookup by ID
 * would return whichever row came first.
 */
export function duplicateNationalIdProblems(
  owner: Record<string, unknown> | undefined,
  members: HouseholdMemberInput[] | undefined,
): string[] {
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const holder of identitiesInSubmission(owner, members)) {
    const first = seen.get(holder.nid);
    if (first) {
      problems.push(
        `National ID ${holder.nid} is used by both ${first} and ${holder.label}; each person needs their own`,
      );
    } else {
      seen.set(holder.nid, holder.label);
    }
  }
  return problems;
}

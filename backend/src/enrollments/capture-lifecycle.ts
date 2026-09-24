/**
 * Pure decisions about capture-time enrollment, kept free of Nest DI so they
 * can be unit tested. The capture step puts a face in the AI gallery before
 * the form is submitted, so every rule about releasing, purging and reusing
 * that person is a place where biometric data can leak or be lost.
 */

/** Role given to an AI person created at capture time, before submission. */
export const PROVISIONAL_ROLE = 'provisional';
export const PROVISIONAL_NAME = 'Pending registration';
/** How long an unclaimed provisional capture may sit in the gallery. */
export const ABANDONED_CAPTURE_TTL_MS = 2 * 60 * 60 * 1000;
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export type GalleryPerson = {
  person_id: string;
  name: string;
  role: string;
  created_at: string;
  template_count: number;
};

/**
 * Which provisional people may be deleted: old enough to be abandoned, and
 * claimed by no enrollment and no face. Anything claimed belongs to a real
 * registration; anything recent may still be a wizard in progress.
 */
export function abandonedCaptures(
  persons: GalleryPerson[], claimedIds: Set<string>, now = Date.now(),
  ttlMs = ABANDONED_CAPTURE_TTL_MS,
): GalleryPerson[] {
  const cutoff = now - ttlMs;
  return persons.filter((person) => person.role === PROVISIONAL_ROLE
    && Date.parse(person.created_at) < cutoff
    && !claimedIds.has(person.person_id));
}

/**
 * Whether a face recognised in the live preview should block the registration.
 * Matching the capture this very draft just enrolled is the applicant seeing
 * themselves, which is expected; anyone else is a real duplicate.
 */
export function isDuplicateMatch(
  decision: string | undefined, matchedPersonId: string | undefined, ownAiPersonId?: string,
): boolean {
  if (decision !== 'confirmed') return false;       // 'tentative' never refuses a registration
  return !ownAiPersonId || matchedPersonId !== ownAiPersonId;
}

/** A capture may only be reused at approval if it still exists WITH templates. */
export function canReuseCapture(person: GalleryPerson | undefined): boolean {
  return Boolean(person && person.template_count > 0);
}

/**
 * Which registrations still reserve an applicant's identity.
 *
 * A National ID and a mobile number may each belong to one live
 * registration, enforced by a unique index on the normalized columns. A
 * rejected registration is not live: the applicant was told to correct
 * something and send the form again, so holding their identity meant the
 * resubmission was refused as a duplicate of the very attempt that was
 * turned down. Rejecting now releases the identity.
 *
 * Everything else still holds it. A pending one is awaiting review, a
 * failed one is an approval to retry, and an approved one is the resident.
 */
export const RELEASED_BY = 'rejected';

export function reservesIdentity(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase() !== RELEASED_BY;
}

/** The statuses whose rows a duplicate check must still look at. */
export function blockingStatuses(all: readonly string[]): string[] {
  return all.filter(reservesIdentity);
}

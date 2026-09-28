/**
 * Who belongs in the Face Database.
 *
 * Only people who registered through the enrolment site. A face record is
 * created by an enrolment approval, which stamps the enrolment reference on
 * it; anything without one was added straight to the AI gallery by a script
 * or the AI webcam page and never went through registration or consent, so it
 * is not shown.
 *
 * This used to be the opposite: the service created a face record for every
 * person in the AI gallery, so those people appeared as though they had
 * registered. Deleting the rows was not enough, because the next page load
 * recreated them.
 */

/** The SQL predicate behind the rule, kept next to the explanation. */
export const FROM_ENROLLMENT_SITE = 'face.enrollmentRef IS NOT NULL';

/** The same rule in memory, for callers that already hold the rows. */
export function isFromEnrollmentSite(face: { enrollmentRef?: string | null }): boolean {
  return Boolean(face.enrollmentRef);
}

/**
 * Whether the cameras can still recognise this person.
 * `null` means the AI service could not be reached, which is not the same as
 * a person being absent from the gallery.
 */
export function inGallery(
  face: { aiPersonId?: string | null },
  gallery: Set<string> | null,
): boolean | null {
  if (!gallery) return null;
  return Boolean(face.aiPersonId && gallery.has(face.aiPersonId));
}

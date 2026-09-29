import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';

/**
 * Who a face belongs to, and therefore what removing it should take with it.
 *
 * Deleting a resident has to reach further than one row. Each person is a
 * face record, a person in the AI gallery, and part of a registration, so
 * removing only the row leaves them recognisable to every camera --
 * a deletion that deletes nothing that matters.
 *
 * The household follows the person who registered: they were only ever in
 * the system because that resident vouched for them, so removing the
 * resident removes them too. It does not work the other way round; deleting
 * a son must not delete his father.
 */
export type Relationship = 'applicant' | 'member' | 'unattached';

export interface RemovalPlan {
  relationship: Relationship;
  /** Gallery people to delete, so no camera recognises them again. */
  aiPersonIds: string[];
  /** Whether the whole registration goes with them. */
  removesEnrollment: boolean;
}

/** Every gallery person a registration owns: the applicant and household. */
export function householdPersonIds(enrollment: Enrollment): string[] {
  const family = (enrollment.family ?? []) as Array<{ aiPersonId?: string | null }>;
  const ids = [enrollment.aiPersonId, ...family.map((member) => member?.aiPersonId)];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Is this face the person who registered, rather than someone they added? */
export function isApplicant(face: Face, enrollment: Enrollment | null): boolean {
  if (!enrollment) return false;
  if (enrollment.faceId && enrollment.faceId === face.id) return true;
  return Boolean(face.aiPersonId && enrollment.aiPersonId === face.aiPersonId);
}

/**
 * What to remove for this face.
 *
 * `enrollment` is whichever registration references the face, if any.
 */
export function planRemoval(face: Face, enrollment: Enrollment | null): RemovalPlan {
  if (enrollment && isApplicant(face, enrollment)) {
    return {
      relationship: 'applicant',
      aiPersonIds: householdPersonIds(enrollment),
      removesEnrollment: true,
    };
  }
  if (enrollment) {
    // A household member: only this person goes. The registration stays,
    // minus them.
    return {
      relationship: 'member',
      aiPersonIds: face.aiPersonId ? [face.aiPersonId] : [],
      removesEnrollment: false,
    };
  }
  // Enrolled directly through the AI, with no registration behind them.
  return {
    relationship: 'unattached',
    aiPersonIds: face.aiPersonId ? [face.aiPersonId] : [],
    removesEnrollment: false,
  };
}

/** The household with one member taken out, for saving back. */
export function familyWithout(enrollment: Enrollment, aiPersonId: string | null) {
  const family = (enrollment.family ?? []) as Array<{ aiPersonId?: string | null }>;
  if (!aiPersonId) return family;
  return family.filter((member) => member?.aiPersonId !== aiPersonId);
}

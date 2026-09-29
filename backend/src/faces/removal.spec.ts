import { familyWithout, householdPersonIds, isApplicant, planRemoval } from './removal';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Face } from '../faces/entities/face.entity';

const face = (over: Partial<Face> = {}) => ({ id: 'F-1', aiPersonId: 'ai-owner', ...over }) as Face;
const enrolment = (over: Partial<Enrollment> = {}) => ({
  ref: 'STMC-1',
  faceId: 'F-1',
  aiPersonId: 'ai-owner',
  family: [{ aiPersonId: 'ai-wife' }, { aiPersonId: 'ai-son' }],
  ...over,
}) as Enrollment;

describe('householdPersonIds', () => {
  it('collects the applicant and everyone they added', () => {
    expect(householdPersonIds(enrolment())).toEqual(['ai-owner', 'ai-wife', 'ai-son']);
  });

  it('ignores household entries that were never enrolled', () => {
    const e = enrolment({ family: [{ aiPersonId: null }, { aiPersonId: 'ai-son' }] as never });
    expect(householdPersonIds(e)).toEqual(['ai-owner', 'ai-son']);
  });

  it('does not repeat a person listed twice', () => {
    const e = enrolment({ family: [{ aiPersonId: 'ai-owner' }] as never });
    expect(householdPersonIds(e)).toEqual(['ai-owner']);
  });

  it('copes with no household at all', () => {
    expect(householdPersonIds(enrolment({ family: [] }))).toEqual(['ai-owner']);
  });
});

describe('isApplicant', () => {
  it('recognises the registered resident by their face record', () => {
    expect(isApplicant(face(), enrolment())).toBe(true);
  });

  it('recognises them by gallery person when the face id differs', () => {
    expect(isApplicant(face({ id: 'F-other' }), enrolment({ faceId: null as never }))).toBe(true);
  });

  it('does not mistake a household member for the applicant', () => {
    expect(isApplicant(face({ id: 'F-2', aiPersonId: 'ai-son' }), enrolment())).toBe(false);
  });

  it('is false with no registration behind the face', () => {
    expect(isApplicant(face(), null)).toBe(false);
  });
});

describe('planRemoval', () => {
  it('removing the resident takes the whole household with them', () => {
    // They were only in the system because the resident vouched for them.
    const plan = planRemoval(face(), enrolment());
    expect(plan.relationship).toBe('applicant');
    expect(plan.aiPersonIds).toEqual(['ai-owner', 'ai-wife', 'ai-son']);
    expect(plan.removesEnrollment).toBe(true);
  });

  it('removing a household member leaves the resident alone', () => {
    // Deleting a son must not delete his father.
    const plan = planRemoval(face({ id: 'F-2', aiPersonId: 'ai-son' }), enrolment());
    expect(plan.relationship).toBe('member');
    expect(plan.aiPersonIds).toEqual(['ai-son']);
    expect(plan.removesEnrollment).toBe(false);
  });

  it('removing someone enrolled outside a registration takes only them', () => {
    const plan = planRemoval(face({ aiPersonId: 'ai-lone' }), null);
    expect(plan.relationship).toBe('unattached');
    expect(plan.aiPersonIds).toEqual(['ai-lone']);
    expect(plan.removesEnrollment).toBe(false);
  });

  it('a face with no gallery person removes nothing from the AI', () => {
    const plan = planRemoval(face({ aiPersonId: null as never }), null);
    expect(plan.aiPersonIds).toEqual([]);
  });
});

describe('familyWithout', () => {
  it('drops just the one member', () => {
    expect(familyWithout(enrolment(), 'ai-son')).toEqual([{ aiPersonId: 'ai-wife' }]);
  });

  it('leaves the household untouched when nobody matches', () => {
    expect(familyWithout(enrolment(), 'ai-nobody')).toHaveLength(2);
  });

  it('leaves it untouched when there is no gallery person to match on', () => {
    expect(familyWithout(enrolment(), null)).toHaveLength(2);
  });
});

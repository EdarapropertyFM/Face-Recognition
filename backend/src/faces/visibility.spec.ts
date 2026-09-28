import { FROM_ENROLLMENT_SITE, inGallery, isFromEnrollmentSite } from './visibility';

describe('isFromEnrollmentSite', () => {
  it('accepts a face created by an enrolment approval', () => {
    expect(isFromEnrollmentSite({ enrollmentRef: 'STMC-150904' })).toBe(true);
  });

  it('rejects a face added straight to the AI gallery', () => {
    // How Elm3lm, Ghanem, Jasmine and Beltagy got into the Face Database:
    // enrolled through the AI webcam page or a script, never registered.
    expect(isFromEnrollmentSite({ enrollmentRef: null })).toBe(false);
    expect(isFromEnrollmentSite({})).toBe(false);
    expect(isFromEnrollmentSite({ enrollmentRef: '' })).toBe(false);
  });

  it('states the rule as SQL for the query builder', () => {
    expect(FROM_ENROLLMENT_SITE).toBe('face.enrollmentRef IS NOT NULL');
  });
});

describe('inGallery', () => {
  it('is true while the cameras can still recognise the person', () => {
    expect(inGallery({ aiPersonId: 'ai-1' }, new Set(['ai-1']))).toBe(true);
  });

  it('is false once they are gone from the gallery', () => {
    expect(inGallery({ aiPersonId: 'ai-1' }, new Set(['other']))).toBe(false);
    expect(inGallery({ aiPersonId: null }, new Set(['ai-1']))).toBe(false);
  });

  it('is null, not false, when the AI service cannot be reached', () => {
    // The difference matters: false tells an operator the person is no longer
    // recognised, which would be a lie if we simply could not ask.
    expect(inGallery({ aiPersonId: 'ai-1' }, null)).toBeNull();
  });
});

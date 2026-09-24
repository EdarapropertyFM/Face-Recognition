import {
  ageFromNationalId, collectsMobile, householdMemberProblems, householdProblems,
  nationalIdProblem, normalizeMember, requiresNationalId,
} from './household-rules';

// 2 = born 19xx. 29001011234567 -> 1990-01-01.
const ADULT_NID = '29001011234567';
const NOW = new Date('2026-09-24T00:00:00Z');
const faces = () => ({ front: 'data:image/jpeg;base64,x', left: 'data:image/jpeg;base64,x',
  right: 'data:image/jpeg;base64,x', stepBack: 'data:image/jpeg;base64,x',
  betterLighting: 'data:image/jpeg;base64,x' });

const adult = () => ({
  name: 'Mona Ali', relation: 'Wife', age: 36, nid: ADULT_NID,
  mobile: '01012345678', nationalIdCard: 'data:image/jpeg;base64,card', faces: faces(),
});

describe('National ID age', () => {
  it('reads the date of birth encoded in the ID', () => {
    expect(ageFromNationalId(ADULT_NID, NOW)).toBe(36);
    expect(ageFromNationalId('30001011234567', NOW)).toBe(26);   // 3 = born 20xx
  });

  it('rejects a malformed or impossible ID', () => {
    expect(nationalIdProblem('123', NOW)).toMatch(/14 digits/);
    expect(nationalIdProblem('49001011234567', NOW)).toMatch(/valid date of birth/); // bad century
    expect(nationalIdProblem('29002301234567', NOW)).toMatch(/valid date of birth/); // 30 February
  });

  it('refuses an ID belonging to someone under 16', () => {
    expect(nationalIdProblem('31501011234567', NOW)).toMatch(/aged 11/);
  });
});

describe('requiresNationalId', () => {
  it('is the 16 boundary', () => {
    expect(requiresNationalId(15)).toBe(false);
    expect(requiresNationalId(16)).toBe(true);
    expect(requiresNationalId('16')).toBe(true);
    expect(requiresNationalId('')).toBe(false);
  });
});

describe('collectsMobile', () => {
  it('skips a phone number for staff only', () => {
    expect(collectsMobile('Wife')).toBe(true);
    expect(collectsMobile('Son')).toBe(true);
    expect(collectsMobile('Driver')).toBe(false);
    expect(collectsMobile('Housekeeper')).toBe(false);
  });
});

describe('householdMemberProblems', () => {
  it('accepts a complete adult relative', () => {
    expect(householdMemberProblems(adult(), 0, NOW)).toEqual([]);
  });

  it('accepts a child with no National ID, since one does not exist below 16', () => {
    expect(householdMemberProblems({
      name: 'Youssef Ali', relation: 'Son', age: 7, mobile: '01012345678', faces: faces(),
    }, 0, NOW)).toEqual([]);
  });

  it('refuses a child carrying a National ID', () => {
    expect(householdMemberProblems({
      name: 'Youssef Ali', relation: 'Son', age: 7, nid: ADULT_NID,
      mobile: '01012345678', faces: faces(),
    }, 0, NOW)).toContainEqual(expect.stringMatching(/under 16 must not have a National ID/));
  });

  it('requires an ID and a card image from 16', () => {
    const problems = householdMemberProblems({
      name: 'Nour Ali', relation: 'Daughter', age: 17, mobile: '01012345678', faces: faces(),
    }, 0, NOW);
    expect(problems).toContainEqual(expect.stringMatching(/14 digits/));
    expect(problems).toContainEqual(expect.stringMatching(/card image is required/));
  });

  it('does not ask staff for a phone number, and refuses one if sent', () => {
    expect(householdMemberProblems({
      name: 'Sayed Omar', relation: 'Driver', age: 45, nid: ADULT_NID,
      nationalIdCard: 'data:image/jpeg;base64,card', faces: faces(),
    }, 0, NOW)).toEqual([]);

    expect(householdMemberProblems({
      name: 'Sayed Omar', relation: 'Driver', age: 45, nid: ADULT_NID, mobile: '01012345678',
      nationalIdCard: 'data:image/jpeg;base64,card', faces: faces(),
    }, 0, NOW)).toContainEqual(expect.stringMatching(/recorded without a phone number/));
  });

  it('requires a relative to give a mobile number', () => {
    const { mobile: _drop, ...noMobile } = adult();
    void _drop;
    expect(householdMemberProblems(noMobile, 0, NOW))
      .toContainEqual(expect.stringMatching(/valid Egyptian mobile/));
  });

  it('requires all five face photos, as camera captures', () => {
    expect(householdMemberProblems({ ...adult(), faces: { front: 'data:image/jpeg;base64,x' } }, 0, NOW))
      .toContainEqual(expect.stringMatching(/five face photos/));
    expect(householdMemberProblems({
      ...adult(), faces: { ...faces(), front: 'https://example.com/photo.jpg' },
    }, 0, NOW)).toContainEqual(expect.stringMatching(/camera captures/));
  });

  it('rejects an unknown relationship', () => {
    expect(householdMemberProblems({ ...adult(), relation: 'Cousin' }, 0, NOW))
      .toContainEqual(expect.stringMatching(/relationship must be one of/));
  });

  it('names the person so the applicant knows which card to fix', () => {
    expect(householdProblems([adult(), { ...adult(), name: 'x' }], NOW)[0]).toMatch(/^Person 2:/);
  });
});

describe('normalizeMember', () => {
  it('drops a staff phone number and an under-16 National ID before storage', () => {
    expect(normalizeMember({
      name: ' Sayed ', relation: 'Driver', age: 45, nid: ADULT_NID, mobile: '01012345678',
      nationalIdCard: 'data:image/jpeg;base64,card',
    })).toMatchObject({ name: 'Sayed', mobile: null, nid: ADULT_NID });

    expect(normalizeMember({ name: 'Youssef', relation: 'Son', age: 7, nid: ADULT_NID,
      nationalIdCard: 'data:image/jpeg;base64,card', mobile: '01012345678' }))
      .toMatchObject({ nid: null, nationalIdCard: null, mobile: '01012345678' });
  });
});

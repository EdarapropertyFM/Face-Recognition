import { cleanResidences, matches, residencesOf, unitCodesFor } from './residence';

describe('cleanResidences', () => {
  it('keeps complete rows and trims them', () => {
    expect(cleanResidences([{ project: ' West Town Residence ', building: ' 4.6-C ', unit: ' 4.6-C-01 ' }]))
      .toEqual([{ project: 'West Town Residence', building: '4.6-C', unit: '4.6-C-01' }]);
  });

  it('drops rows missing any of the three parts', () => {
    expect(cleanResidences([
      { project: 'West Town Residence', building: '4.6-C', unit: '' },
      { project: '', building: '4.6-C', unit: '4.6-C-01' },
      { building: '4.6-C', unit: '4.6-C-01' },
    ])).toEqual([]);
  });

  it('counts the same flat listed twice as one flat', () => {
    const twice = [
      { project: 'West Town Residence', building: '4.6-C', unit: '4.6-C-01' },
      { project: 'west town residence', building: '4.6-C', unit: '4.6-c-01' },
    ];
    expect(cleanResidences(twice)).toHaveLength(1);
  });

  it('keeps several genuinely different units, across projects', () => {
    expect(cleanResidences([
      { project: 'West Town Residence', building: '4.6-C', unit: '4.6-C-01' },
      { project: 'West Town Residence', building: '3.5-B', unit: '3.5-B-05' },
      { project: 'Another Project', building: 'A-1', unit: 'A-1-09' },
    ])).toHaveLength(3);
  });

  it('survives a non-array', () => {
    expect(cleanResidences(null)).toEqual([]);
    expect(cleanResidences('4.6-C-01')).toEqual([]);
  });
});

describe('residencesOf', () => {
  const projectOf = (building: string) => (building === '4.6-C' ? 'West Town Residence' : 'Unassigned');

  it('prefers the residences list when present', () => {
    const enrollment = {
      residences: [{ project: 'West Town Residence', building: '3.5-B', unit: '3.5-B-05' }],
      building: '4.6-C',
      unit: '4.6-C-01',
    };
    expect(residencesOf(enrollment, projectOf)).toEqual([
      { project: 'West Town Residence', building: '3.5-B', unit: '3.5-B-05' },
    ]);
  });

  it('falls back to the legacy columns so older rows still count', () => {
    expect(residencesOf({ building: '4.6-C', unit: '4.6-C-01' }, projectOf)).toEqual([
      { project: 'West Town Residence', building: '4.6-C', unit: '4.6-C-01' },
    ]);
  });

  it('returns nothing when there is no residence at all', () => {
    expect(residencesOf({ building: '', unit: '' }, projectOf)).toEqual([]);
  });
});

describe('unitCodesFor', () => {
  it('uses the exact codes when they were supplied', () => {
    expect(unitCodesFor('4.6-C', 99, ['4.6-C-01', '4.6-C-PH'])).toEqual(['4.6-C-01', '4.6-C-PH']);
  });

  it('generates padded codes from the unit count', () => {
    expect(unitCodesFor('4.6-C', 3, [])).toEqual(['4.6-C-01', '4.6-C-02', '4.6-C-03']);
  });

  it('offers nothing until someone says how many units there are', () => {
    expect(unitCodesFor('4.6-C', 0, [])).toEqual([]);
  });
});

describe('matches', () => {
  it('matches case-insensitively on any field', () => {
    expect(matches('west', 'West Town Residence', '4.6-C')).toBe(true);
    expect(matches('4.6', 'West Town Residence', '4.6-C')).toBe(true);
    expect(matches('nope', 'West Town Residence', '4.6-C')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matches('   ', null, undefined)).toBe(true);
  });
});

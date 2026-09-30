import { conflictingUnits, ownerClaimedUnits, unitKey } from './unit-lock';

const claim = (over: Partial<Parameters<typeof ownerClaimedUnits>[0][number]> = {}) => ({
  ref: 'STMC-1', status: 'approved', residentType: 'owner', ownerName: 'Ahmed Mostafa',
  residences: [{ project: 'West Town Residence', building: '4.6-C', unit: '4.6C-1' }],
  ...over,
});

const unit = (u: string, b = '4.6-C') => [{ project: 'West Town Residence', building: b, unit: u }];

describe('owner-claimed units', () => {
  it('locks a unit whose owner has been approved', () => {
    const held = ownerClaimedUnits([claim()]);
    expect(held.get(unitKey('West Town Residence', '4.6-C', '4.6C-1'))).toBe('Ahmed Mostafa');
  });

  it('locks it from the moment it is submitted, before anyone approves it', () => {
    expect(ownerClaimedUnits([claim({ status: 'pending' })]).size).toBe(1);
  });

  it('releases a unit whose owner registration was rejected', () => {
    expect(ownerClaimedUnits([claim({ status: 'rejected' })]).size).toBe(0);
  });

  it('does not lock a unit because a tenant registered there', () => {
    expect(ownerClaimedUnits([claim({ residentType: 'tenant' })]).size).toBe(0);
  });

  it('locks every unit an owner holds, not only their primary one', () => {
    const held = ownerClaimedUnits([claim({
      residences: [...unit('4.6C-1'), ...unit('4.6C-5')],
    })]);
    expect(held.size).toBe(2);
  });

  it('treats the same unit code in another project as a different unit', () => {
    const held = ownerClaimedUnits([claim()]);
    expect(held.has(unitKey('Eastown', '4.6-C', '4.6C-1'))).toBe(false);
  });

  it('ignores case and stray spacing in the codes', () => {
    const held = ownerClaimedUnits([claim()]);
    expect(held.has(unitKey(' west town residence ', '4.6-C', ' 4.6c-1'))).toBe(true);
  });
});

describe('conflicts on submission', () => {
  const held = ownerClaimedUnits([claim()]);
  const heldBy = new Map([[unitKey('West Town Residence', '4.6-C', '4.6C-1'), 'STMC-1']]);

  it('rejects a second owner for the same unit', () => {
    expect(conflictingUnits(held, unit('4.6C-1'), 'owner')).toEqual(['4.6C-1']);
  });

  it('lets a tenant register in a unit that has an owner', () => {
    expect(conflictingUnits(held, unit('4.6C-1'), 'tenant')).toEqual([]);
  });

  it('lets an owner take a unit nobody has claimed', () => {
    expect(conflictingUnits(held, unit('4.6C-2'), 'owner')).toEqual([]);
  });

  it('does not report an enrolment as clashing with itself', () => {
    expect(conflictingUnits(held, unit('4.6C-1'), 'owner', heldBy, 'STMC-1')).toEqual([]);
  });

  it('reports every clashing unit when several are claimed at once', () => {
    const many = ownerClaimedUnits([claim({ residences: [...unit('4.6C-1'), ...unit('4.6C-3')] })]);
    expect(conflictingUnits(many, [...unit('4.6C-1'), ...unit('4.6C-3'), ...unit('4.6C-9')], 'owner'))
      .toEqual(['4.6C-1', '4.6C-3']);
  });
});

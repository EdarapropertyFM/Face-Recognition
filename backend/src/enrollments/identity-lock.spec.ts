import { reservesIdentity, blockingStatuses } from './identity-lock';

describe('identity reservation', () => {
  it('releases the identity once a registration is rejected', () => {
    expect(reservesIdentity('rejected')).toBe(false);
    expect(reservesIdentity('REJECTED')).toBe(false);
  });

  it('keeps it reserved while the registration is still live', () => {
    for (const status of ['pending', 'processing', 'approved', 'failed']) {
      expect(reservesIdentity(status)).toBe(true);
    }
  });

  it('treats an unknown or missing status as still reserved', () => {
    expect(reservesIdentity(undefined)).toBe(true);
    expect(reservesIdentity(null)).toBe(true);
    expect(reservesIdentity('')).toBe(true);
  });

  it('lists only the statuses a duplicate check must consider', () => {
    expect(blockingStatuses(['pending', 'rejected', 'approved']))
      .toEqual(['pending', 'approved']);
  });
});

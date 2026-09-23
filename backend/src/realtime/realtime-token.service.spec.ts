import { RealtimeTokenService } from './realtime-token.service';

describe('RealtimeTokenService', () => {
  const previous = process.env.REALTIME_SIGNING_KEY;
  const service = new RealtimeTokenService();

  beforeAll(() => { process.env.REALTIME_SIGNING_KEY = 'realtime-test-signing-key-with-safe-length'; });
  afterAll(() => {
    if (previous === undefined) delete process.env.REALTIME_SIGNING_KEY;
    else process.env.REALTIME_SIGNING_KEY = previous;
  });

  it('issues a signed expiring token', () => {
    const token = service.issue('saud', 'Admin');
    expect(service.verify(token)).toMatchObject({ user: 'saud', role: 'Admin' });
  });

  it('rejects altered tokens', () => {
    const token = service.issue('saud', 'Admin');
    expect(() => service.verify(`${token.slice(0, -1)}x`)).toThrow('Invalid realtime token');
  });
});

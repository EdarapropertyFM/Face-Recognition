import { StreamTokenService } from './stream-token.service';

describe('StreamTokenService', () => {
  const service = new StreamTokenService();
  const previous = process.env.CAMERA_STREAM_SIGNING_KEY;

  beforeAll(() => { process.env.CAMERA_STREAM_SIGNING_KEY = 'test-stream-signing-key-that-is-long-enough'; });
  afterAll(() => {
    if (previous === undefined) delete process.env.CAMERA_STREAM_SIGNING_KEY;
    else process.env.CAMERA_STREAM_SIGNING_KEY = previous;
  });

  it('issues a token scoped to one playback id', () => {
    const token = service.issue('playback-one');
    expect(service.verify(token, 'playback-one').playbackId).toBe('playback-one');
    expect(() => service.verify(token, 'playback-two')).toThrow('Expired or invalid stream token');
  });

  it('rejects a modified signature', () => {
    const token = service.issue('playback-one');
    expect(() => service.verify(`${token.slice(0, -1)}x`, 'playback-one')).toThrow('Invalid stream token');
  });
});

import { SecretCipherService } from './secret-cipher.service';

describe('SecretCipherService', () => {
  const previous = process.env.CAMERA_CREDENTIALS_KEY;

  beforeEach(() => { process.env.CAMERA_CREDENTIALS_KEY = Buffer.alloc(32, 9).toString('base64'); });
  afterAll(() => {
    if (previous === undefined) delete process.env.CAMERA_CREDENTIALS_KEY;
    else process.env.CAMERA_CREDENTIALS_KEY = previous;
  });

  it('encrypts and decrypts camera credentials without retaining plaintext', () => {
    const service = new SecretCipherService();
    const source = 'rtsp://admin:secret@10.0.0.5:554/stream';
    const encrypted = service.encrypt(source);
    expect(encrypted).not.toContain('admin');
    expect(encrypted).not.toContain('secret');
    expect(service.decrypt(encrypted)).toBe(source);
  });

  it('rejects a tampered payload', () => {
    const service = new SecretCipherService();
    const encrypted = service.encrypt('rtsp://camera/stream');
    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });
});

import { validateEnvironment } from './validate-environment';

describe('validateEnvironment', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('allows local development without production secrets', () => {
    process.env.NODE_ENV = 'development';
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('rejects production with missing secrets', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => validateEnvironment()).toThrow('JWT_SECRET');
  });

  it('accepts a complete production configuration', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'j'.repeat(32);
    process.env.STMC_AI_EVENT_TOKEN = 'a'.repeat(32);
    process.env.DB_PASSWORD = 'database-password-strong';
    process.env.BIOMETRIC_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    process.env.CAMERA_CREDENTIALS_KEY = Buffer.alloc(32, 4).toString('base64');
    process.env.CAMERA_STREAM_SIGNING_KEY = 's'.repeat(32);
    process.env.REALTIME_SIGNING_KEY = 'r'.repeat(32);
    process.env.DB_SYNCHRONIZE = 'false';
    expect(() => validateEnvironment()).not.toThrow();
  });
});

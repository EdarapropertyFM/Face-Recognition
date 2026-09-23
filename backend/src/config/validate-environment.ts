function requireSecret(name: string, minimumLength: number) {
  const value = process.env[name];
  if (!value || value.length < minimumLength) throw new Error(`${name} must be configured with at least ${minimumLength} characters`);
}

export function validateEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;
  requireSecret('JWT_SECRET', 32);
  requireSecret('STMC_AI_EVENT_TOKEN', 32);
  requireSecret('DB_PASSWORD', 12);

  const encryptionKey = Buffer.from(process.env.BIOMETRIC_ENCRYPTION_KEY || '', 'base64');
  if (encryptionKey.length !== 32) throw new Error('BIOMETRIC_ENCRYPTION_KEY must be a Base64-encoded 32-byte key');
  const cameraKey = Buffer.from(process.env.CAMERA_CREDENTIALS_KEY || '', 'base64');
  if (cameraKey.length !== 32) throw new Error('CAMERA_CREDENTIALS_KEY must be a Base64-encoded 32-byte key');
  requireSecret('CAMERA_STREAM_SIGNING_KEY', 32);
  requireSecret('REALTIME_SIGNING_KEY', 32);
  if (process.env.DB_SYNCHRONIZE === 'true') throw new Error('DB_SYNCHRONIZE must not be enabled in production');
}

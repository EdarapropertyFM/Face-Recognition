import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class SecretCipherService {
  private readonly key = this.resolveKey();

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv, tag, encrypted].map((part) => typeof part === 'string' ? part : part.toString('base64url')).join('.');
  }

  decrypt(payload: string) {
    const [version, ivValue, tagValue, encryptedValue] = payload.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private resolveKey() {
    const configured = process.env.CAMERA_CREDENTIALS_KEY;
    if (configured) {
      const key = Buffer.from(configured, 'base64');
      if (key.length !== 32) throw new Error('CAMERA_CREDENTIALS_KEY must be a Base64-encoded 32-byte key');
      return key;
    }
    const developmentSeed = process.env.BIOMETRIC_ENCRYPTION_KEY || process.env.JWT_SECRET || 'stmc-local-camera-secret';
    return createHash('sha256').update(developmentSeed).digest();
  }
}

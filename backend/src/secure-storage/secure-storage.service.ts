import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ASSET_PREFIX = 'asset://';
const IMAGE_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const EXTENSIONS: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' };
const ENCRYPTION_HEADER = Buffer.from('STMCENC1');

@Injectable()
export class SecureStorageService {
  private readonly root = path.resolve(process.env.BIOMETRIC_STORAGE_DIR || path.join(process.cwd(), 'storage'));

  /** `prefix` keeps a household member's files apart from the owner's in the same folder. */
  async storeEnrollmentOwner(ref: string, owner: Record<string, unknown>, prefix = '') {
    const stored = structuredClone(owner);
    const faces = { ...((stored.faces as Record<string, unknown> | undefined) ?? {}) };

    for (const [key, value] of Object.entries(faces)) {
      if (typeof value === 'string' && value.startsWith('data:image/')) {
        faces[key] = await this.writeImage(ref, `${prefix}face-${this.safeSegment(key)}`, value);
      }
    }
    stored.faces = faces;

    if (typeof stored.nationalIdCard === 'string' && stored.nationalIdCard.startsWith('data:image/')) {
      stored.nationalIdCard = await this.writeImage(ref, `${prefix}national-id`, stored.nationalIdCard);
    }
    return stored;
  }

  async hydrateEnrollmentOwner(owner: Record<string, unknown>) {
    const hydrated = structuredClone(owner);
    const faces = { ...((hydrated.faces as Record<string, unknown> | undefined) ?? {}) };
    for (const [key, value] of Object.entries(faces)) {
      if (typeof value === 'string' && value.startsWith(ASSET_PREFIX)) faces[key] = await this.readDataUrl(value);
    }
    hydrated.faces = faces;
    if (typeof hydrated.nationalIdCard === 'string' && hydrated.nationalIdCard.startsWith(ASSET_PREFIX)) {
      hydrated.nationalIdCard = await this.readDataUrl(hydrated.nationalIdCard);
    }
    return hydrated;
  }

  async resolveImage(value: unknown) {
    if (typeof value !== 'string') return null;
    if (value.startsWith('data:image/')) return value;
    if (value.startsWith(ASSET_PREFIX)) return this.readDataUrl(value);
    return null;
  }

  async deleteEnrollment(ref: string) {
    const directory = this.resolveInsideRoot(path.join('enrollments', this.safeSegment(ref)));
    await rm(directory, { recursive: true, force: true });
  }

  private async writeImage(ref: string, name: string, dataUrl: string) {
    const match = dataUrl.match(IMAGE_PATTERN);
    if (!match) throw new BadRequestException('Invalid biometric image data');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new BadRequestException('Each biometric image must be 2 MB or smaller');

    const relative = path.join('enrollments', this.safeSegment(ref), `${name}.${EXTENSIONS[match[1]]}.enc`);
    const absolute = this.resolveInsideRoot(relative);
    await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await writeFile(absolute, this.encrypt(bytes), { mode: 0o600 });
    return `${ASSET_PREFIX}${relative.replaceAll('\\', '/')}`;
  }

  private async readDataUrl(assetReference: string) {
    const relative = assetReference.slice(ASSET_PREFIX.length);
    const absolute = this.resolveInsideRoot(relative);
    const storedBytes = await readFile(absolute);
    const bytes = storedBytes.subarray(0, ENCRYPTION_HEADER.length).equals(ENCRYPTION_HEADER)
      ? this.decrypt(storedBytes)
      : storedBytes;
    const withoutEncryptionExtension = absolute.endsWith('.enc') ? absolute.slice(0, -4) : absolute;
    const extension = path.extname(withoutEncryptionExtension).slice(1).toLowerCase();
    const mime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }

  private resolveInsideRoot(relative: string) {
    const resolved = path.resolve(this.root, relative);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new BadRequestException('Invalid storage path');
    }
    return resolved;
  }

  private safeSegment(value: string) {
    const safe = value.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) throw new BadRequestException('Invalid asset identifier');
    return safe;
  }

  private encrypt(plain: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([ENCRYPTION_HEADER, iv, cipher.getAuthTag(), encrypted]);
  }

  private decrypt(payload: Buffer) {
    const ivStart = ENCRYPTION_HEADER.length;
    const tagStart = ivStart + 12;
    const encryptedStart = tagStart + 16;
    if (payload.length <= encryptedStart) throw new BadRequestException('Encrypted asset is corrupted');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), payload.subarray(ivStart, tagStart));
      decipher.setAuthTag(payload.subarray(tagStart, encryptedStart));
      return Buffer.concat([decipher.update(payload.subarray(encryptedStart)), decipher.final()]);
    } catch {
      throw new BadRequestException('Encrypted asset could not be authenticated');
    }
  }

  private encryptionKey() {
    const configured = process.env.BIOMETRIC_ENCRYPTION_KEY;
    if (configured) {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length === 32) return decoded;
    }
    return createHash('sha256')
      .update(process.env.JWT_SECRET || 'stmc-development-encryption-key')
      .digest();
  }
}

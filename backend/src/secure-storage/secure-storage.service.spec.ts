import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SecureStorageService } from './secure-storage.service';

describe('SecureStorageService', () => {
  let directory: string;
  let previousDirectory: string | undefined;
  let previousKey: string | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'stmc-storage-'));
    previousDirectory = process.env.BIOMETRIC_STORAGE_DIR;
    previousKey = process.env.BIOMETRIC_ENCRYPTION_KEY;
    process.env.BIOMETRIC_STORAGE_DIR = directory;
    process.env.BIOMETRIC_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterEach(async () => {
    if (previousDirectory === undefined) delete process.env.BIOMETRIC_STORAGE_DIR;
    else process.env.BIOMETRIC_STORAGE_DIR = previousDirectory;
    if (previousKey === undefined) delete process.env.BIOMETRIC_ENCRYPTION_KEY;
    else process.env.BIOMETRIC_ENCRYPTION_KEY = previousKey;
    await rm(directory, { recursive: true, force: true });
  });

  it('encrypts biometric images and restores the original data URL', async () => {
    const service = new SecureStorageService();
    const original = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const stored = await service.storeEnrollmentOwner('STMC-TEST', { faces: { front: original } });
    const reference = (stored.faces as Record<string, string>).front;
    const encrypted = await readFile(path.join(directory, reference.slice('asset://'.length)));

    expect(reference).toMatch(/\.enc$/);
    expect(encrypted.subarray(0, 8).toString()).toBe('STMCENC1');
    expect(encrypted.subarray(0, 8).toString('hex')).not.toBe('89504e470d0a1a0a');
    const hydrated = await service.hydrateEnrollmentOwner(stored);
    expect((hydrated.faces as Record<string, string>).front).toBe(original);
  });

  it('rejects a file whose authentication tag was modified', async () => {
    const service = new SecureStorageService();
    const original = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const stored = await service.storeEnrollmentOwner('STMC-TAMPER', { faces: { front: original } });
    const reference = (stored.faces as Record<string, string>).front;
    const file = path.join(directory, reference.slice('asset://'.length));
    const encrypted = await readFile(file);
    encrypted[25] ^= 0xff;
    await writeFile(file, encrypted);

    await expect(service.hydrateEnrollmentOwner(stored)).rejects.toThrow('could not be authenticated');
  });

  it('encrypts a vehicle licence and restores it, leaving the other fields alone', async () => {
    const service = new SecureStorageService();
    const original = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const [stored] = await service.storeVehicleLicences('STMC-CAR', [
      { plate: 'ABC 123', color: 'Black', licence: original },
    ]) as Record<string, string>[];

    // The raw image must never survive in the database column.
    expect(stored.licence).toMatch(/^asset:\/\/.+\.enc$/);
    expect(stored.plate).toBe('ABC 123');
    const encrypted = await readFile(path.join(directory, stored.licence.slice('asset://'.length)));
    expect(encrypted.subarray(0, 8).toString()).toBe('STMCENC1');

    const [hydrated] = await service.hydrateVehicleLicences([stored]) as Record<string, string>[];
    expect(hydrated.licence).toBe(original);
    expect(hydrated.color).toBe('Black');
  });

});

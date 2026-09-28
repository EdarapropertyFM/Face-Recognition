import { join } from 'path';
import { findEnvFile } from './load-env';

/**
 * The .env used to be located by a fixed number of '..' hops from the
 * compiled file. Adding one .ts file outside src/ changed TypeScript's
 * inferred root, the build output gained a directory level, and that path
 * quietly pointed at a file that did not exist. Nothing complained; the
 * backend simply could not reach the database.
 */
describe('findEnvFile', () => {
  /** A fake filesystem holding .env at exactly these directories. */
  const envIn = (...dirs: string[]) => {
    const present = new Set(dirs.map((dir) => join(dir, '.env')));
    return (candidate: string) => present.has(candidate);
  };

  const root = join('C:', 'app');
  const backend = join(root, 'backend');

  it('finds .env one level up (the old dist/config layout)', () => {
    const from = join(backend, 'dist', 'config');
    expect(findEnvFile(from, 6, envIn(backend))).toBe(join(backend, '.env'));
  });

  it('finds it two levels up (the dist/src/config layout that broke it)', () => {
    const from = join(backend, 'dist', 'src', 'config');
    expect(findEnvFile(from, 6, envIn(backend))).toBe(join(backend, '.env'));
  });

  it('prefers the nearest .env when several exist', () => {
    const from = join(backend, 'dist', 'src', 'config');
    expect(findEnvFile(from, 6, envIn(root, backend))).toBe(join(backend, '.env'));
  });

  it('returns null rather than guessing when there is none', () => {
    const from = join(backend, 'dist', 'src', 'config');
    expect(findEnvFile(from, 6, () => false)).toBeNull();
  });

  it('stops at the filesystem root instead of looping forever', () => {
    expect(findEnvFile(join('C:', ''), 6, () => false)).toBeNull();
  });

  it('respects the level limit', () => {
    const deep = join(root, 'a', 'b', 'c', 'd');
    expect(findEnvFile(deep, 2, envIn(root))).toBeNull();
    expect(findEnvFile(deep, 4, envIn(root))).toBe(join(root, '.env'));
  });
});

// Loads .env before anything else is imported.
//
// This must be its own module, imported first in main.ts: TypeScript/CommonJS
// runs every `import` at the top of a file before any statement in it, and
// TypeOrmModule.forRoot() reads process.env while app.module.ts is being
// imported. Calling process.loadEnvFile() further down main.ts therefore runs
// too late, and the database options silently fall back to their defaults.
import { existsSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Find the nearest .env by walking up from a starting directory.
 *
 * This used to be a fixed join(__dirname, '..', '..', '.env'), which assumed
 * the compiled file would land at dist/config/. Adding a single .ts file
 * outside src/ changed TypeScript's inferred root, so the output moved to
 * dist/src/config/ and that path started pointing at backend/dist/.env --
 * which does not exist. The .env was silently not loaded, every database
 * setting fell back to a default, and the only symptom was the backend
 * failing to connect with ECONNREFUSED while psql worked fine.
 *
 * Walking up finds it wherever the build happens to put things.
 */
export function findEnvFile(
  startDir: string,
  levels = 6,
  exists: (path: string) => boolean = existsSync,
): string | null {
  let dir = startDir;
  for (let i = 0; i <= levels; i += 1) {
    const candidate = join(dir, '.env');
    if (exists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;          // reached the filesystem root
    dir = parent;
  }
  return null;
}

// Missing .env is fine: deployment settings can still come from the host.
// But say which file was used, because a silently unloaded .env looks exactly
// like a database that is down.
const envFile = findEnvFile(__dirname) ?? findEnvFile(process.cwd());
if (envFile) {
  try {
    process.loadEnvFile(envFile);
    console.log(`[config] loaded ${envFile}`);
  } catch (error) {
    console.warn(`[config] could not read ${envFile}: ${(error as Error).message}`);
  }
} else {
  console.warn('[config] no .env found; using host environment only');
}

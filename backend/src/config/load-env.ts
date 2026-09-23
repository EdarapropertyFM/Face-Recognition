// Loads .env before anything else is imported.
//
// This must be its own module, imported first in main.ts: TypeScript/CommonJS
// runs every `import` at the top of a file before any statement in it, and
// TypeOrmModule.forRoot() reads process.env while app.module.ts is being
// imported. Calling process.loadEnvFile() further down main.ts therefore runs
// too late, and the database options silently fall back to their defaults.
import { join } from 'path';

// Missing .env is fine: deployment settings can still come from the host.
try {
  process.loadEnvFile(join(__dirname, '..', '..', '.env'));
} catch {
  /* no local .env */
}

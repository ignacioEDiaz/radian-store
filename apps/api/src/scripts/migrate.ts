import { loadConfig } from '../config/env.js';
import { runMigrations } from '../shared/infrastructure/db/migrate.js';

const config = loadConfig();
for (const role of ['write', 'read'] as const) {
  const applied = await runMigrations(role, config.db[role].url);
  console.log(`[${role}-db] ${applied.length ? applied.join(', ') : 'sin migraciones pendientes'}`);
}

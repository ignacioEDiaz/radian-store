import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runner } from 'node-pg-migrate';

export type DatabaseRole = 'write' | 'read';

const migrationsRoot = fileURLToPath(new URL('../../../../migrations/', import.meta.url));

export function migrationsDir(role: DatabaseRole): string {
  return path.join(migrationsRoot, role);
}

/** Aplica las migraciones pendientes de una base. Cada base tiene su propio historial. */
export async function runMigrations(
  role: DatabaseRole,
  databaseUrl: string,
  log: (msg: string) => void = () => {},
): Promise<string[]> {
  const applied = await runner({
    databaseUrl,
    dir: migrationsDir(role),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    log,
  });
  return applied.map((m) => m.name);
}

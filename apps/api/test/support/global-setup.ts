import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/shared/infrastructure/db/migrate.js';

declare module 'vitest' {
  export interface ProvidedContext {
    writeDbUrl: string;
    readDbUrl: string;
    redisUrl: string;
  }
}

let write: StartedPostgreSqlContainer | undefined;
let read: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

/** Levanta PostgreSQL ×2 y Redis reales una vez por corrida de integración. */
export async function setup(project: TestProject) {
  [write, read, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').withDatabase('radian_write').start(),
    new PostgreSqlContainer('postgres:17-alpine').withDatabase('radian_read').start(),
    new RedisContainer('redis:8-alpine').start(),
  ]);
  await runMigrations('write', write.getConnectionUri());
  await runMigrations('read', read.getConnectionUri());
  project.provide('writeDbUrl', write.getConnectionUri());
  project.provide('readDbUrl', read.getConnectionUri());
  project.provide('redisUrl', redis.getConnectionUrl());
}

export async function teardown() {
  await Promise.all([write?.stop(), read?.stop(), redis?.stop()]);
}

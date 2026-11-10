import type { UnitOfWork } from '../../application/unit-of-work.js';
import type { DbPool, TxClient } from './pool.js';

/** UnitOfWork sobre una transacción de la base de escritura; los repos se crean ligados a ella. */
export function createUnitOfWork<R>(writeDb: DbPool, makeRepos: (tx: TxClient) => R): UnitOfWork<R> {
  return { run: (work) => writeDb.withTransaction((tx) => work(makeRepos(tx))) };
}

/** UnitOfWork que reutiliza una transacción ya abierta (políticas dentro del proyector). */
export function inTransaction<R>(tx: TxClient, makeRepos: (tx: TxClient) => R): UnitOfWork<R> {
  return { run: (work) => work(makeRepos(tx)) };
}

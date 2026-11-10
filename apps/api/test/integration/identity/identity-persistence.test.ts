import { beforeEach, describe, expect, it } from 'vitest';
import { truncate, useDatabases } from '../../support/databases.js';
import { createUnitOfWork } from '../../../src/shared/infrastructure/db/unit-of-work.js';
import { PgCustomerRepository } from '../../../src/modules/identity/infrastructure/persistence/pg-customer-repository.js';
import { PgCustomerProfileReader } from '../../../src/modules/identity/infrastructure/persistence/pg-customer-profile-reader.js';
import { customerProfileProjection } from '../../../src/modules/identity/infrastructure/projections/customer-profile-projection.js';
import { Customer } from '../../../src/modules/identity/domain/customer.js';
import { Email } from '../../../src/modules/identity/domain/email.js';
import { Address } from '../../../src/modules/identity/domain/address.js';
import { Projector } from '../../../src/shared/infrastructure/outbox/projector.js';
import { NullCache } from '../../../src/shared/infrastructure/cache/null-cache.js';
import { Metrics } from '../../../src/shared/infrastructure/observability/metrics.js';
import { ConflictError } from '../../../src/shared/domain/errors.js';
import { silentLogger } from '../../support/logger.js';
import { inject } from 'vitest';

const dbs = useDatabases();
const now = new Date('2026-11-10T12:00:00Z');

beforeEach(async () => {
  await truncate(dbs.writeDb, ['customers', 'outbox', 'consumer_checkpoint']);
  await truncate(dbs.readDb, ['customer_profiles', 'consumer_checkpoint']);
});

const uow = () => createUnitOfWork(dbs.writeDb, (tx) => ({ customers: new PgCustomerRepository(tx) }));
const newCustomer = (email = 'ana@example.com') =>
  Customer.register({ id: crypto.randomUUID(), email: Email.create(email), name: 'Ana', passwordHash: 'hash', now });

function projector() {
  return new Projector({
    writeDb: dbs.writeDb,
    readDb: dbs.readDb,
    listenUrl: inject('writeDbUrl'),
    consumers: [customerProfileProjection],
    cache: new NullCache(),
    metrics: new Metrics(),
    logger: silentLogger,
    pollMs: 60_000,
  });
}

describe('PgCustomerRepository', () => {
  it('guarda y recupera por id y por email, con eventos en el outbox de la misma transacción', async () => {
    const c = newCustomer();
    await uow().run(({ customers }) => customers.save(c));
    const byEmail = await uow().run(({ customers }) => customers.findByEmail(Email.create('ANA@example.com')));
    expect(byEmail?.toSnapshot()).toMatchObject({ id: c.id, name: 'Ana', version: 1 });
    expect(byEmail?.passwordHash).toBe('hash');
    const { rows } = await dbs.writeDb.query('SELECT event_type FROM outbox');
    expect(rows).toEqual([{ event_type: 'identity.CustomerRegistered' }]);
  });

  it('actualiza con concurrencia optimista', async () => {
    const c = newCustomer();
    await uow().run(({ customers }) => customers.save(c));
    const a = (await uow().run(({ customers }) => customers.findById(c.id)))!;
    const b = (await uow().run(({ customers }) => customers.findById(c.id)))!;
    a.updateProfile({ name: 'Ana A' }, now);
    b.updateProfile({ name: 'Ana B' }, now);
    await uow().run(({ customers }) => customers.save(a));
    await expect(uow().run(({ customers }) => customers.save(b))).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('email duplicado → ConflictError EMAIL_TAKEN', async () => {
    await uow().run(({ customers }) => customers.save(newCustomer()));
    await expect(uow().run(({ customers }) => customers.save(newCustomer()))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('customerProfileProjection + PgCustomerProfileReader', () => {
  it('proyecta registro, actualización y desactivación de forma idempotente', async () => {
    const c = newCustomer();
    await uow().run(({ customers }) => customers.save(c));
    const loaded = (await uow().run(({ customers }) => customers.findById(c.id)))!;
    loaded.updateProfile(
      { name: 'Ana María', defaultAddress: Address.create({ recipient: 'Ana', line1: 'Calle 1', city: 'CABA', region: 'CABA', postalCode: '1000', country: 'AR', phone: '1155555555' }) },
      now,
    );
    loaded.deactivate(now);
    await uow().run(({ customers }) => customers.save(loaded));
    await projector().runOnce();
    await dbs.writeDb.query('UPDATE outbox SET processed_at = NULL');
    await projector().runOnce();

    const reader = new PgCustomerProfileReader(dbs.readDb);
    expect(await reader.findProfile(c.id)).toMatchObject({ name: 'Ana María', defaultAddress: { city: 'CABA' }, role: 'customer' });
    expect(await reader.findAuth(c.id)).toEqual({ id: c.id, role: 'customer', status: 'disabled' });
    expect(await reader.findProfile(crypto.randomUUID())).toBeNull();
  });
});

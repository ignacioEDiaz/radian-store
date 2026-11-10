import { beforeEach, describe, expect, it } from 'vitest';
import { RegisterCustomer } from '../../../../src/modules/identity/application/commands/register-customer.js';
import { Authenticate } from '../../../../src/modules/identity/application/commands/authenticate.js';
import { UpdateProfile } from '../../../../src/modules/identity/application/commands/update-profile.js';
import { EnsureStaffAccount } from '../../../../src/modules/identity/application/commands/ensure-staff-account.js';
import { GetMyProfile } from '../../../../src/modules/identity/application/queries/get-my-profile.js';
import { ConflictError, NotFoundError, RateLimitedError, UnauthorizedError } from '../../../../src/shared/domain/errors.js';
import { NullCache } from '../../../../src/shared/infrastructure/cache/null-cache.js';
import {
  FakeLimiter,
  InMemoryCustomerRepository,
  fakeHasher,
  fakeUow,
  fixedClock,
  inMemoryProfileReader,
  sequentialIds,
} from '../../../support/identity-fakes.js';

let repo: InMemoryCustomerRepository;
let limiter: FakeLimiter;
let deps: ReturnType<typeof makeDeps>;

function makeDeps() {
  return { uow: fakeUow({ customers: repo }), hasher: fakeHasher, clock: fixedClock, ids: sequentialIds(), limiter };
}

beforeEach(() => {
  repo = new InMemoryCustomerRepository();
  limiter = new FakeLimiter();
  deps = makeDeps();
});

const register = () => new RegisterCustomer(deps).execute({ name: 'Ana', email: 'ana@example.com', password: 'una-clave-larga' });

describe('RegisterCustomer', () => {
  it('crea la cuenta con la contraseña hasheada y devuelve el perfil', async () => {
    const profile = await register();
    expect(profile).toEqual({ id: expect.any(String), email: 'ana@example.com', name: 'Ana', role: 'customer', defaultAddress: null });
    expect(repo.rows.get(profile.id)!.passwordHash).toBe('hashed:una-clave-larga');
    expect(repo.published).toEqual(['identity.CustomerRegistered']);
  });

  it('rechaza un email ya registrado (sin importar mayúsculas)', async () => {
    await register();
    await expect(
      new RegisterCustomer(deps).execute({ name: 'Otra', email: 'ANA@example.com ', password: 'otra-clave-larga' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(register()).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('Authenticate', () => {
  const login = (password = 'una-clave-larga', email = 'ana@example.com') =>
    new Authenticate(deps).execute({ email, password, ip: '1.2.3.4' });

  it('devuelve el perfil con credenciales válidas', async () => {
    await register();
    await expect(login()).resolves.toMatchObject({ email: 'ana@example.com', role: 'customer' });
  });

  it('mensaje genérico para contraseña incorrecta y para email inexistente', async () => {
    await register();
    const wrong = await login('incorrecta').catch((e: unknown) => e);
    const missing = await login('una-clave-larga', 'nadie@example.com').catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(UnauthorizedError);
    expect(wrong).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((missing as Error).message).toBe((wrong as Error).message);
  });

  it('bloquea tras 5 fallos y un login exitoso reinicia el contador', async () => {
    await register();
    for (let i = 0; i < 4; i += 1) await login('mal').catch(() => undefined);
    await expect(login()).resolves.toBeTruthy();
    for (let i = 0; i < 5; i += 1) await login('mal').catch(() => undefined);
    await expect(login()).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('rechaza cuentas desactivadas', async () => {
    const { id } = await register();
    const c = (await repo.findById(id))!;
    c.deactivate(fixedClock.now());
    await repo.save(c);
    await expect(login()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('UpdateProfile', () => {
  it('actualiza nombre y dirección', async () => {
    const { id } = await register();
    const updated = await new UpdateProfile(deps).execute({
      customerId: id,
      name: 'Ana María',
      defaultAddress: { recipient: 'Ana', line1: 'Calle 123', city: 'Rosario', region: 'Santa Fe', postalCode: '2000', country: 'ar', phone: '3415555555' },
    });
    expect(updated).toMatchObject({ name: 'Ana María', defaultAddress: { country: 'AR', city: 'Rosario' } });
  });

  it('404 si la cuenta no existe', async () => {
    await expect(new UpdateProfile(deps).execute({ customerId: crypto.randomUUID(), name: 'X Y' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('EnsureStaffAccount', () => {
  it('crea el admin si no existe y es idempotente', async () => {
    const ensure = new EnsureStaffAccount(deps);
    await ensure.execute({ email: 'admin@radian.store', password: 'admin-password-123', role: 'admin' });
    await ensure.execute({ email: 'admin@radian.store', password: 'admin-password-123', role: 'admin' });
    expect([...repo.rows.values()].filter((r) => r.role === 'admin')).toHaveLength(1);
  });

  it('crea la cuenta de solo lectura con rol viewer', async () => {
    await new EnsureStaffAccount(deps).execute({ email: 'demo@radian.store', password: 'demo-password-123', role: 'viewer' });
    expect([...repo.rows.values()][0]).toMatchObject({ email: 'demo@radian.store', role: 'viewer', passwordHash: 'hashed:demo-password-123' });
  });

  it('ajusta el rol de una cuenta existente sin tocar su contraseña', async () => {
    await register();
    await new EnsureStaffAccount(deps).execute({ email: 'ana@example.com', password: 'x-no-se-usa-123', role: 'admin' });
    expect([...repo.rows.values()][0]!.role).toBe('admin');
    expect([...repo.rows.values()][0]!.passwordHash).toBe('hashed:una-clave-larga');
  });
});

describe('GetMyProfile', () => {
  it('lee del modelo de lectura y 404 si no existe', async () => {
    const { id } = await register();
    const query = new GetMyProfile({ reader: inMemoryProfileReader(repo), cache: new NullCache() });
    await expect(query.execute({ customerId: id })).resolves.toMatchObject({ name: 'Ana' });
    await expect(query.execute({ customerId: crypto.randomUUID() })).rejects.toBeInstanceOf(NotFoundError);
  });
});

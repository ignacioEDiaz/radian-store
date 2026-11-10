import { describe, expect, it } from 'vitest';
import { Customer } from '../../../../src/modules/identity/domain/customer.js';
import { Email } from '../../../../src/modules/identity/domain/email.js';
import { Address } from '../../../../src/modules/identity/domain/address.js';
import { DomainError } from '../../../../src/shared/domain/errors.js';

const now = new Date('2026-11-10T12:00:00Z');
const id = '6f1c2b8e-1d3a-4c5b-9e7f-0a1b2c3d4e5f';

const address = {
  recipient: 'Ana Pérez',
  line1: 'Av. Siempre Viva 742',
  city: 'Buenos Aires',
  region: 'CABA',
  postalCode: '1405',
  country: 'ar',
  phone: '+54 11 5555-5555',
};

describe('Email', () => {
  it('normaliza a minúsculas y sin espacios', () => {
    expect(Email.create('  Ana@Example.COM ').value).toBe('ana@example.com');
  });
  it('rechaza formatos inválidos', () => {
    expect(() => Email.create('no-es-email')).toThrow(DomainError);
  });
});

describe('Address', () => {
  it('normaliza el país y exige campos obligatorios', () => {
    expect(Address.create(address).toJSON().country).toBe('AR');
    expect(() => Address.create({ ...address, city: ' ' })).toThrow(/city/);
  });
});

describe('Customer', () => {
  const register = () =>
    Customer.register({ id, email: Email.create('ana@example.com'), name: '  Ana  ', passwordHash: 'h', now });

  it('se registra activo, como cliente, y emite CustomerRegistered', () => {
    const c = register();
    expect(c.toSnapshot()).toMatchObject({ id, email: 'ana@example.com', name: 'Ana', role: 'customer', status: 'active', defaultAddress: null });
    const [event] = c.pullEvents();
    expect(event).toMatchObject({ type: 'identity.CustomerRegistered', aggregateVersion: 1, payload: { email: 'ana@example.com', name: 'Ana', role: 'customer' } });
  });

  it('valida el largo del nombre', () => {
    expect(() => Customer.register({ id, email: Email.create('a@b.co'), name: 'A', passwordHash: 'h', now })).toThrow(DomainError);
  });

  it('actualiza perfil y emite evento solo si hubo cambios', () => {
    const c = register();
    c.pullEvents();
    c.updateProfile({ name: 'Ana' }, now);
    expect(c.pullEvents()).toHaveLength(0);
    c.updateProfile({ name: 'Ana María', defaultAddress: Address.create(address) }, now);
    const [event] = c.pullEvents();
    expect(event).toMatchObject({ type: 'identity.CustomerProfileUpdated', payload: { name: 'Ana María', defaultAddress: { country: 'AR' } } });
    c.updateProfile({ defaultAddress: null }, now);
    expect(c.toSnapshot().defaultAddress).toBeNull();
  });

  it('puede promoverse a admin y desactivarse', () => {
    const c = register();
    c.pullEvents();
    c.promoteToAdmin(now);
    c.promoteToAdmin(now);
    c.deactivate(now);
    expect(c.pullEvents().map((e) => e.type)).toEqual(['identity.CustomerRoleChanged', 'identity.CustomerDeactivated']);
    expect(c.isActive).toBe(false);
    expect(c.toSnapshot().role).toBe('admin');
  });

  it('se rehidrata desde persistencia sin emitir eventos', () => {
    const snapshot = { ...register().toSnapshot(), version: 3 };
    const c = Customer.rehydrate({ ...snapshot, passwordHash: 'h' });
    expect(c.version).toBe(3);
    expect(c.pullEvents()).toEqual([]);
  });
});

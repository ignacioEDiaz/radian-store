import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { DomainError } from '../../../shared/domain/errors.js';
import { Address, type AddressData } from './address.js';
import { Email } from './email.js';
import type { CustomerEvent, CustomerSnapshot, CustomerStatus, Role } from './events.js';

function personName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw new DomainError('INVALID_NAME', 'El nombre debe tener entre 2 y 80 caracteres');
  return name;
}

interface State {
  email: Email;
  name: string;
  passwordHash: string;
  role: Role;
  status: CustomerStatus;
  defaultAddress: Address | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Cuenta de cliente o administrador (agregado del contexto identity). */
export class Customer extends AggregateRoot<CustomerEvent> {
  readonly aggregateType = 'Customer';

  private constructor(id: string, version: number, private state: State) {
    super(id, version);
  }

  static register(input: { id: string; email: Email; name: string; passwordHash: string; role?: Role; now: Date }): Customer {
    const customer = new Customer(input.id, 0, {
      email: input.email,
      name: personName(input.name),
      passwordHash: input.passwordHash,
      role: input.role ?? 'customer',
      status: 'active',
      defaultAddress: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
    customer.emit('identity.CustomerRegistered', input.now, (s) => ({ snapshot: s, email: s.email, name: s.name, role: s.role }));
    return customer;
  }

  static rehydrate(row: Omit<CustomerSnapshot, 'defaultAddress'> & { defaultAddress: AddressData | null; passwordHash: string }): Customer {
    return new Customer(row.id, row.version, {
      email: Email.create(row.email),
      name: row.name,
      passwordHash: row.passwordHash,
      role: row.role,
      status: row.status,
      defaultAddress: row.defaultAddress ? Address.create(row.defaultAddress) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  get email(): Email {
    return this.state.email;
  }
  get passwordHash(): string {
    return this.state.passwordHash;
  }
  get role(): Role {
    return this.state.role;
  }
  get isActive(): boolean {
    return this.state.status === 'active';
  }

  updateProfile(changes: { name?: string; defaultAddress?: Address | null }, now: Date): void {
    const name = changes.name !== undefined ? personName(changes.name) : this.state.name;
    const address = changes.defaultAddress !== undefined ? changes.defaultAddress : this.state.defaultAddress;
    const sameAddress = address === null ? this.state.defaultAddress === null : address.equals(this.state.defaultAddress);
    if (name === this.state.name && sameAddress) return;
    this.state = { ...this.state, name, defaultAddress: address, updatedAt: now };
    this.emit('identity.CustomerProfileUpdated', now, (s) => ({ snapshot: s, name: s.name, defaultAddress: s.defaultAddress }));
  }

  promoteToAdmin(now: Date): void {
    if (this.state.role === 'admin') return;
    this.state = { ...this.state, role: 'admin', updatedAt: now };
    this.emit('identity.CustomerRoleChanged', now, (s) => ({ snapshot: s, role: s.role }));
  }

  deactivate(now: Date): void {
    if (!this.isActive) return;
    this.state = { ...this.state, status: 'disabled', updatedAt: now };
    this.emit('identity.CustomerDeactivated', now, (s) => ({ snapshot: s }));
  }

  toSnapshot(): CustomerSnapshot {
    return {
      id: this.id,
      email: this.state.email.value,
      name: this.state.name,
      role: this.state.role,
      status: this.state.status,
      defaultAddress: this.state.defaultAddress?.toJSON() ?? null,
      version: this.version,
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
    };
  }

  /** Registra el evento con un snapshot posterior al cambio (proyecciones simples y reconstruibles). */
  private emit<T extends CustomerEvent['type']>(
    type: T,
    now: Date,
    payload: (s: CustomerSnapshot) => Extract<CustomerEvent, { type: T }>['payload'],
  ): void {
    const snapshot = { ...this.toSnapshot(), version: this.version + 1 };
    this.record(type, payload(snapshot) as never, now);
  }
}

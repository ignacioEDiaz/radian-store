import { ConflictError } from '../../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../../shared/infrastructure/db/pool.js';
import { isUniqueViolation } from '../../../../shared/infrastructure/db/pg-errors.js';
import { appendToOutbox } from '../../../../shared/infrastructure/outbox/outbox-writer.js';
import { Customer } from '../../domain/customer.js';
import type { CustomerRepository } from '../../domain/customer-repository.js';
import type { Email } from '../../domain/email.js';
import type { AddressData } from '../../domain/address.js';
import type { CustomerStatus, Role } from '../../domain/events.js';

interface Row {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  status: CustomerStatus;
  default_address: AddressData | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, email, name, password_hash, role, status, default_address, version, created_at, updated_at';

export class PgCustomerRepository implements CustomerRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<Customer | null> {
    const { rows } = await this.db.query<Row>(`SELECT ${COLUMNS} FROM customers WHERE id = $1`, [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByEmail(email: Email): Promise<Customer | null> {
    const { rows } = await this.db.query<Row>(`SELECT ${COLUMNS} FROM customers WHERE email = $1`, [email.value]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(customer: Customer): Promise<void> {
    if (!customer.hasChanges) return;
    const s = customer.toSnapshot();
    try {
      if (customer.persistedVersion === 0) {
        await this.db.query(
          `INSERT INTO customers (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [s.id, s.email, s.name, customer.passwordHash, s.role, s.status, json(s.defaultAddress), s.version, s.createdAt, s.updatedAt],
        );
      } else {
        const { rowCount } = await this.db.query(
          `UPDATE customers SET name = $2, role = $3, status = $4, default_address = $5, version = $6, updated_at = $7
            WHERE id = $1 AND version = $8`,
          [s.id, s.name, s.role, s.status, json(s.defaultAddress), s.version, s.updatedAt, customer.persistedVersion],
        );
        if (rowCount === 0) throw new ConflictError('VERSION_CONFLICT', 'La cuenta fue modificada por otra operación');
      }
    } catch (err) {
      if (isUniqueViolation(err, 'customers_email_key')) throw new ConflictError('EMAIL_TAKEN', 'Ese email ya está registrado');
      throw err;
    }
    await appendToOutbox(this.db, customer.pullEvents());
  }
}

const json = (v: unknown) => (v === null ? null : JSON.stringify(v));

function toDomain(r: Row): Customer {
  return Customer.rehydrate({
    id: r.id,
    email: r.email,
    name: r.name,
    passwordHash: r.password_hash,
    role: r.role,
    status: r.status,
    defaultAddress: r.default_address,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

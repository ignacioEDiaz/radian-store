import type { Customer } from './customer.js';
import type { Email } from './email.js';

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: Email): Promise<Customer | null>;
  /** Guarda con concurrencia optimista y publica los eventos pendientes en el outbox. */
  save(customer: Customer): Promise<void>;
}

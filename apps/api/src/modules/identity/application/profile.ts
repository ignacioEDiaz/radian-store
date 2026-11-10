import type { Profile } from '@radian/contracts';
import type { Customer } from '../domain/customer.js';

/** Vista pública de la cuenta (sin datos sensibles). */
export function toProfile(customer: Customer): Profile {
  const s = customer.toSnapshot();
  return { id: s.id, email: s.email, name: s.name, role: s.role, defaultAddress: s.defaultAddress };
}

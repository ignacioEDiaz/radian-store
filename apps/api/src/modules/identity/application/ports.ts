import type { Profile } from '@radian/contracts';
import type { CustomerRepository } from '../domain/customer-repository.js';
import type { Role, CustomerStatus } from '../domain/events.js';

export interface IdentityRepos {
  customers: CustomerRepository;
}

/** Lecturas de identity contra el modelo de lectura. */
export interface CustomerProfileReader {
  findProfile(id: string): Promise<Profile | null>;
  findAuth(id: string): Promise<{ id: string; role: Role; status: CustomerStatus } | null>;
}

export interface LoginAttemptLimiter {
  check(key: string): Promise<{ blocked: boolean; retryAfterSeconds: number }>;
  recordFailure(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

export interface SessionClaims {
  sub: string;
  role: Role;
}

export interface TokenIssuer {
  issue(claims: SessionClaims): Promise<string>;
  verify(token: string): Promise<SessionClaims | null>;
}

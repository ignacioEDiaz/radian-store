import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import type { AddressData } from './address.js';

export type Role = 'customer' | 'admin' | 'viewer';
export type CustomerStatus = 'active' | 'disabled';

export interface CustomerSnapshot {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: CustomerStatus;
  defaultAddress: AddressData | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomerRegistered = DomainEvent<'identity.CustomerRegistered', { snapshot: CustomerSnapshot; email: string; name: string; role: Role }>;
export type CustomerProfileUpdated = DomainEvent<'identity.CustomerProfileUpdated', { snapshot: CustomerSnapshot; name: string; defaultAddress: AddressData | null }>;
export type CustomerRoleChanged = DomainEvent<'identity.CustomerRoleChanged', { snapshot: CustomerSnapshot; role: Role }>;
export type CustomerDeactivated = DomainEvent<'identity.CustomerDeactivated', { snapshot: CustomerSnapshot }>;

export type CustomerEvent = CustomerRegistered | CustomerProfileUpdated | CustomerRoleChanged | CustomerDeactivated;

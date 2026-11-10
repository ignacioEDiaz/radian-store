import { HttpResponse } from 'msw';
import type { Profile } from '@radian/contracts';

export const customerProfile: Profile = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@example.com',
  name: 'Ana',
  role: 'customer',
  defaultAddress: null,
};

export const adminProfile: Profile = { ...customerProfile, id: '22222222-2222-4222-8222-222222222222', email: 'admin@radian.store', name: 'Marta', role: 'admin' };

export function problem(status: number, code: string, detail: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: 'about:blank', title: 'Error', status, code, detail, ...extra },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

export const unauthenticated = () => problem(401, 'UNAUTHENTICATED', 'Necesitás iniciar sesión');

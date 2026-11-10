import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginRequest, Profile, RegisterRequest, UpdateProfileRequest } from '@radian/contracts';
import { queryKeys } from '../../../shared/api/queryKeys';
import { authService } from '../services/authService';

export function useSession() {
  const query = useQuery({ queryKey: queryKeys.session, queryFn: authService.me, staleTime: 5 * 60_000 });
  const role = query.data?.role;
  return {
    ...query,
    profile: query.data ?? null,
    isAuthenticated: !!query.data,
    isAdmin: role === 'admin',
    /** Puede entrar al panel (admin o cuenta de solo lectura). */
    isStaff: role === 'admin' || role === 'viewer',
    isReadOnly: role === 'viewer',
  };
}

/** Tras login/registro: fija la sesión y refresca datos que dependen del usuario (p. ej. carrito). */
function useSessionMutation<I>(fn: (input: I) => Promise<Profile>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.session, profile);
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'catalog' });
    },
  });
}

export const useLogin = () => useSessionMutation((input: LoginRequest) => authService.login(input));
export const useRegister = () => useSessionMutation((input: RegisterRequest) => authService.register(input));

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.session, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' && q.queryKey[0] !== 'catalog' });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileRequest) => authService.updateProfile(input),
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.session, profile),
  });
}

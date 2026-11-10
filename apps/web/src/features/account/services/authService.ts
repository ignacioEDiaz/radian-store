import { profileSchema, type LoginRequest, type Profile, type RegisterRequest, type UpdateProfileRequest } from '@radian/contracts';
import { ApiError, httpClient } from '../../../shared/api/httpClient';

export const authService = {
  register: (input: RegisterRequest) => httpClient.post<Profile>('/api/auth/register', input, { schema: profileSchema }),
  login: (input: LoginRequest) => httpClient.post<Profile>('/api/auth/login', input, { schema: profileSchema }),
  logout: () => httpClient.post<void>('/api/auth/logout'),
  /** Perfil de la sesión actual o `null` si no hay sesión (401 no es un error para la UI). */
  async me(): Promise<Profile | null> {
    try {
      return await httpClient.get('/api/me', { schema: profileSchema });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  updateProfile: (input: UpdateProfileRequest) => httpClient.patch<Profile>('/api/me', input, { schema: profileSchema }),
};

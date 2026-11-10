import { ApiError } from './httpClient';

export const READ_ONLY_EVENT = 'radian:read-only';

/**
 * Si el servidor rechazó una modificación porque la cuenta es de solo lectura, avisa a la UI
 * (el diálogo global muestra la explicación). La restricción real la aplica siempre el backend.
 */
export function reportIfReadOnly(error: unknown): void {
  if (error instanceof ApiError && error.code === 'READ_ONLY_ACCOUNT') {
    window.dispatchEvent(new CustomEvent<string>(READ_ONLY_EVENT, { detail: error.message }));
  }
}

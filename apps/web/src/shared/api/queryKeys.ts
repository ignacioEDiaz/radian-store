/** Query keys centralizadas: una sola fuente para leer, invalidar y precargar. */
export const queryKeys = {
  system: {
    health: ['system', 'health'] as const,
  },
  session: ['session'] as const,
};

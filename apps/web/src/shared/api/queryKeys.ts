/** Query keys centralizadas: una sola fuente para leer, invalidar y precargar. */
export const queryKeys = {
  system: {
    health: ['system', 'health'] as const,
  },
  session: ['session'] as const,
  admin: {
    all: ['admin'] as const,
    products: (filter: object) => ['admin', 'products', filter] as const,
    product: (id: string) => ['admin', 'product', id] as const,
    collections: ['admin', 'collections'] as const,
  },
};

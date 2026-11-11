/** Query keys centralizadas: una sola fuente para leer, invalidar y precargar. */
export const queryKeys = {
  system: {
    health: ['system', 'health'] as const,
  },
  session: ['session'] as const,
  cart: ['cart'] as const,
  checkout: { quote: (input: object) => ['checkout', 'quote', input] as const },
  orders: {
    mine: (page: number) => ['orders', 'mine', page] as const,
    detail: (number: string) => ['orders', 'detail', number] as const,
    admin: (filter: object) => ['admin', 'orders', filter] as const,
    adminDetail: (number: string) => ['admin', 'order', number] as const,
  },
  catalog: {
    all: ['catalog'] as const,
    list: (params: object) => ['catalog', 'list', params] as const,
    product: (slug: string) => ['catalog', 'product', slug] as const,
    collection: (slug: string) => ['catalog', 'collection', slug] as const,
  },
  admin: {
    all: ['admin'] as const,
    products: (filter: object) => ['admin', 'products', filter] as const,
    product: (id: string) => ['admin', 'product', id] as const,
    collections: ['admin', 'collections'] as const,
  },
};

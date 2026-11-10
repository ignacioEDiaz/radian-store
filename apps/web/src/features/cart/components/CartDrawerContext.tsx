import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface DrawerState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const Ctx = createContext<DrawerState | null>(null);

/** Estado de UI del panel del carrito (el carrito en sí vive en React Query). */
export function CartDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }), [isOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCartDrawer(): DrawerState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCartDrawer requiere CartDrawerProvider');
  return ctx;
}

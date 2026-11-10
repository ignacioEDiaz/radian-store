import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../hooks/useSession';

function Loading() {
  return (
    <p className="container" aria-busy="true" style={{ paddingBlock: 'var(--space-12)' }}>
      Cargando…
    </p>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isPending, isAuthenticated } = useSession();
  const location = useLocation();
  if (isPending) return <Loading />;
  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/cuenta/ingresar?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isPending, isStaff } = useSession();
  if (isPending) return <Loading />;
  if (!isStaff) {
    return (
      <section className="container" style={{ paddingBlock: 'var(--space-12)' }}>
        <h1>Sin permiso</h1>
        <p>Esta sección es solo para administración.</p>
      </section>
    );
  }
  return <RequireAuth>{children}</RequireAuth>;
}

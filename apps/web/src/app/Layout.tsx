import { useEffect } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { ReadOnlyDialog } from '../shared/ui/ReadOnlyDialog';

/**
 * El marco de la página (barra de anuncios, header, menús, carrito, footer) es el del tema
 * original y vive fuera de React; acá solo se monta el contenido de cada ruta.
 */
export function Layout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
      <ReadOnlyDialog />
    </>
  );
}

/** Contenedor de las pantallas propias (cuenta, checkout, pedidos, administración, estado). */
export function AppPage() {
  return (
    <div className="app-page">
      <Outlet />
    </div>
  );
}

/** La home es el documento del tema, no una ruta de React: se la pide al servidor. */
export function HomeDocument() {
  useEffect(() => {
    window.location.replace('/');
  }, []);
  return <div className="app-page app-page--loading" aria-busy="true" />;
}

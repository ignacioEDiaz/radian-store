import { Link, useLocation } from 'react-router';
import { usePageTitle } from '../../../shared/ui/usePageTitle';

const TITLES: Record<string, string> = {
  about: 'Nosotros',
  contact: 'Contacto',
  stockists: 'Puntos de venta',
  'theme-features': 'Sobre este proyecto',
  'privacy-policy': 'Política de privacidad',
};

/**
 * Páginas de contenido del tema (nosotros, contacto, notas del blog). La tienda original las
 * servía desde su CMS; en este proyecto de portafolio el foco está en el catálogo y la compra.
 */
export function InfoPage() {
  const { pathname } = useLocation();
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';
  const isArticle = pathname.startsWith('/blogs/');
  const title = TITLES[slug] ?? (isArticle ? 'Journal' : 'Información');
  usePageTitle(title);
  return (
    <section className="app-page app-empty">
      <h1>{title}</h1>
      <p>
        Esta sección es parte del contenido editorial de la tienda de demostración y todavía no tiene texto propio. El catálogo, el carrito, el
        checkout y las cuentas funcionan de punta a punta contra el backend.
      </p>
      <Link to="/collections/all" className="btn">
        Ir a la tienda
      </Link>
    </section>
  );
}

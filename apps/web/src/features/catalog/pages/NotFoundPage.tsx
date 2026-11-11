import { Link } from 'react-router';
import { usePageTitle } from '../../../shared/ui/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Página no encontrada');
  return (
    <section className="app-page app-empty">
      <h1>
        No encontramos <span className="serif">lo que buscabas.</span>
      </h1>
      <p>Puede que el producto ya no esté disponible o que el enlace haya cambiado.</p>
      <Link to="/collections/all" className="btn">
        Ver todos los productos
      </Link>
    </section>
  );
}

import { Link } from 'react-router';
import styles from '../catalog.module.css';

export function Pagination({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (n: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginación" className={styles.pagination}>
      {page > 1 ? (
        <Link to={href(page - 1)} rel="prev">
          ← Anterior
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <span>
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link to={href(page + 1)} rel="next">
          Siguiente →
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}

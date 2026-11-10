import { useState } from 'react';
import { Link } from 'react-router';
import type { ProductStatus } from '@radian/contracts';
import { formatMoney } from '../../../shared/format/money';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { useAdminProducts } from '../hooks/useAdminCatalog';
import { STATUS_LABEL } from '../labels';
import styles from '../admin.module.css';

export function ProductsListPage() {
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [q, setQ] = useState('');
  const { data, isPending, isError, refetch } = useAdminProducts({ status: status || undefined, q: q || undefined, page: 1 });

  return (
    <section className={styles.page} aria-labelledby="products-title">
      <div className={styles.toolbar}>
        <div>
          <h1 id="products-title">Productos</h1>
          {data && <p className={styles.muted}>{data.total === 1 ? '1 producto' : `${data.total} productos`}</p>}
        </div>
        <div className={styles.inline}>
          <div className="field">
            <label htmlFor="filter-status">Estado</label>
            <select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus | '')}>
              <option value="">Todos</option>
              <option value="published">Publicados</option>
              <option value="draft">Borradores</option>
              <option value="archived">Archivados</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="filter-q">Buscar</label>
            <input id="filter-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, tipo, material…" />
          </div>
          <Link className="btn btn--accent" to="/admin/productos/nuevo">
            Nuevo producto
          </Link>
        </div>
      </div>
      {isError && <ErrorState message="No se pudieron cargar los productos" onRetry={() => void refetch()} />}
      {isPending && <p aria-busy="true">Cargando…</p>}
      {data && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Imagen</span>
              </th>
              <th scope="col">Producto</th>
              <th scope="col">Estado</th>
              <th scope="col">Precio</th>
              <th scope="col">Variantes</th>
              <th scope="col">Stock</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td>{p.imageUrl ? <img className={styles.thumb} src={p.imageUrl} alt="" loading="lazy" /> : <div className={styles.thumb} />}</td>
                <th scope="row">
                  <Link to={`/admin/productos/${p.id}`}>{p.title}</Link>
                </th>
                <td>
                  <span className={`${styles.badge} ${styles[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                </td>
                <td>{formatMoney(p.priceCents)}</td>
                <td>{p.variantCount}</td>
                <td>{p.totalStock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

import { Link, useNavigate, useParams } from 'react-router';
import type { AdminProduct } from '@radian/contracts';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { adminCatalogService } from '../services/adminCatalogService';
import { useAdminProduct, useCreateProduct, useProductCommand } from '../hooks/useAdminCatalog';
import { ProductDetailsForm } from '../components/ProductDetailsForm';
import { VariantsSection } from '../components/VariantsSection';
import { ImagesSection } from '../components/ImagesSection';
import { CommandError } from '../components/CommandError';
import { STATUS_LABEL } from '../labels';
import styles from '../admin.module.css';

export function ProductEditorPage() {
  const { id } = useParams();
  return id === 'nuevo' ? <CreateProduct /> : <EditProduct id={id!} />;
}

function CreateProduct() {
  const create = useCreateProduct();
  const navigate = useNavigate();
  return (
    <section className={styles.page} aria-labelledby="new-title">
      <p>
        <Link to="/admin/productos">← Productos</Link>
      </p>
      <h1 id="new-title">Nuevo producto</h1>
      <CommandError error={create.error} />
      <div className={styles.section}>
        <ProductDetailsForm
          submitLabel="Crear producto"
          pending={create.isPending}
          onSubmit={(values) => create.mutate(values, { onSuccess: (p) => void navigate(`/admin/productos/${p.id}`, { replace: true }) })}
        />
      </div>
    </section>
  );
}

function EditProduct({ id }: { id: string }) {
  const { data: product, isPending, isError, refetch } = useAdminProduct(id);
  if (isPending) return <p className={styles.page} aria-busy="true">Cargando…</p>;
  if (isError || !product) return <div className={styles.page}><ErrorState message="No se pudo cargar el producto" onRetry={() => void refetch()} /></div>;
  return (
    <section className={styles.page} aria-labelledby="product-title">
      <p>
        <Link to="/admin/productos">← Productos</Link>
      </p>
      <h1 id="product-title">{product.title}</h1>
      <StatusBar product={product} />
      <DetailsSection key={product.version} product={product} />
      <VariantsSection product={product} />
      <ImagesSection product={product} />
    </section>
  );
}

function StatusBar({ product }: { product: AdminProduct }) {
  const change = useProductCommand(product.id, (action: 'publish' | 'unpublish' | 'archive') => adminCatalogService.changeStatus(product.id, action, product.version));
  return (
    <>
      <div className={styles.status}>
        <span className={`${styles.badge} ${styles[product.status]}`}>{STATUS_LABEL[product.status]}</span>
        <span className={styles.muted}>/{product.slug} · versión {product.version}</span>
        {product.status === 'draft' && (
          <button type="button" className="btn btn--accent" disabled={change.isPending} onClick={() => change.mutate('publish')}>
            Publicar
          </button>
        )}
        {product.status === 'published' && (
          <>
            <a className="btn btn--ghost" href={`/products/${product.slug}`} target="_blank" rel="noreferrer">
              Ver en la tienda
            </a>
            <button type="button" className="btn btn--ghost" disabled={change.isPending} onClick={() => change.mutate('unpublish')}>
              Despublicar
            </button>
          </>
        )}
        {product.status !== 'archived' && (
          <button type="button" className="btn btn--ghost" disabled={change.isPending} onClick={() => change.mutate('archive')}>
            Archivar
          </button>
        )}
      </div>
      <CommandError error={change.error} productId={product.id} />
    </>
  );
}

function DetailsSection({ product }: { product: AdminProduct }) {
  const save = useProductCommand(product.id, (values: Parameters<typeof adminCatalogService.updateProduct>[1]) => adminCatalogService.updateProduct(product.id, values));
  return (
    <section className={styles.section} aria-labelledby="details-title">
      <h2 id="details-title">Datos</h2>
      <CommandError error={save.error} productId={product.id} />
      <ProductDetailsForm initial={product} submitLabel="Guardar datos" pending={save.isPending} onSubmit={(values) => save.mutate({ ...values, expectedVersion: product.version })} />
    </section>
  );
}

import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import type { ProductDetail, VariantView } from '@radian/contracts';
import { ApiError } from '../../../shared/api/httpClient';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { useProduct } from '../hooks/useCatalog';
import { Gallery } from '../components/Gallery';
import { PriceTag } from '../components/PriceTag';
import { VariantSelector } from '../components/VariantSelector';
import { ProductGrid } from '../components/ProductGrid';
import { NotFoundPage } from './NotFoundPage';
import styles from '../catalog.module.css';

/** Acción de compra inyectable (el carrito la provee en la feature 005). */
export type PurchaseSlot = (props: { product: ProductDetail; variant: VariantView | null }) => ReactNode;

export function ProductPage({ purchase }: { purchase?: PurchaseSlot }) {
  const { slug = '' } = useParams();
  const { data, isPending, isError, error, refetch } = useProduct(slug);

  if (isPending) return <p className={styles.listing} aria-busy="true">Cargando…</p>;
  if (isError && error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (isError || !data) return <div className={styles.listing}><ErrorState message="No pudimos cargar el producto." onRetry={() => void refetch()} /></div>;
  return <ProductView key={data.id} product={data} purchase={purchase} />;
}

function ProductView({ product, purchase }: { product: ProductDetail; purchase?: PurchaseSlot | undefined }) {
  const firstAvailable = product.variants.find((v) => v.available)?.color ?? product.options.colors[0] ?? '';
  const [color, setColor] = useState(firstAvailable);
  const [size, setSize] = useState<string | null>(null);
  const variant = product.variants.find((v) => v.color === color && v.size === size) ?? null;

  return (
    <article className={styles.product}>
      <Gallery images={product.images} color={color} />
      <div className={styles.productInfo}>
        <p className={styles.eyebrow}>{product.productType}</p>
        <h1>{product.title}</h1>
        <PriceTag priceCents={variant?.priceCents ?? product.priceCents} compareAtCents={product.compareAtCents} large />
        <VariantSelector
          product={product}
          color={color}
          size={size}
          onColor={(c) => {
            setColor(c);
            if (size && !product.variants.find((v) => v.color === c && v.size === size)?.available) setSize(null);
          }}
          onSize={setSize}
        />
        {variant && variant.availableQty <= 3 && <p className={styles.lowStock}>¡Últimas {variant.availableQty} unidades!</p>}
        {purchase ? purchase({ product, variant }) : !size && <p className={styles.muted}>Elegí un talle.</p>}
        <div className={styles.description}>
          <h2>Descripción</h2>
          <p>{product.description}</p>
          {product.materials.length > 0 && <p className={styles.muted}>Materiales: {product.materials.join(', ')}</p>}
        </div>
      </div>
      {product.related.length > 0 && (
        <section className={styles.related} aria-labelledby="related-title">
          <h2 id="related-title">También te puede gustar</h2>
          <ProductGrid products={product.related.slice(0, 4)} priorityCount={0} />
        </section>
      )}
    </article>
  );
}

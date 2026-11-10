import type { ProductDetail, VariantView } from '@radian/contracts';
import { useAddToCart } from '../hooks/useCart';
import { useCartDrawer } from './CartDrawerContext';
import styles from '../cart.module.css';

export function AddToCart({ product, variant }: { product: ProductDetail; variant: VariantView | null }) {
  const { open } = useCartDrawer();
  const add = useAddToCart(open);

  if (!variant) {
    return (
      <button type="button" className="btn btn--block" disabled>
        Elegí un talle
      </button>
    );
  }
  return (
    <div className={styles.addToCart}>
      <button
        type="button"
        className="btn btn--accent btn--block"
        disabled={!variant.available || add.isPending}
        onClick={() =>
          add.mutate({
            variantId: variant.id,
            quantity: 1,
            preview: {
              variantId: variant.id,
              productSlug: product.slug,
              title: product.title,
              color: variant.color,
              size: variant.size,
              image: product.images.find((i) => i.color === variant.color) ?? product.image,
              unitPriceCents: variant.priceCents,
              available: true,
              maxQuantity: variant.availableQty,
            },
          })
        }
      >
        {variant.available ? 'Agregar al carrito' : 'Agotado'}
      </button>
      {add.error && (
        <p role="alert" className={styles.error}>
          {add.error.message}
        </p>
      )}
    </div>
  );
}

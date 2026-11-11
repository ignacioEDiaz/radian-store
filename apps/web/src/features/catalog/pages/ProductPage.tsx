import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { FREE_SHIPPING_THRESHOLD_CENTS, MAX_LINE_QUANTITY, type ImageView, type ProductDetail } from '@radian/contracts';
import { ApiError } from '../../../shared/api/httpClient';
import { formatMoney } from '../../../shared/format/money';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { usePageTitle } from '../../../shared/ui/usePageTitle';
import { addToThemeCart } from '../../../theme-bridge/themeApi';
import { useThemeEnhance } from '../../../theme-ui/enhance';
import { DisclosureIcon, MinusIcon, PlusIcon, TruckIcon } from '../../../theme-ui/icons';
import { cssVars, MotionLabel, swatchColor, ThemeImage } from '../../../theme-ui/primitives';
import { ProductCard } from '../../../theme-ui/ProductCard';
import { useProduct } from '../hooks/useCatalog';
import { NotFoundPage } from './NotFoundPage';

const SECTION_VARS = cssVars({
  '--product-section-space-top-desktop': '24px',
  '--product-section-space-bottom-desktop': '64px',
  '--product-section-space-top-mobile': '0px',
  '--product-section-space-bottom-mobile': '40px',
  '--product-content-padding': '5%',
});
const FORM_VARS = cssVars({
  '--product-atc-bg': 'var(--button-bg)',
  '--product-atc-text': 'var(--button-fg)',
  '--product-atc-border': 'var(--button-bg)',
  '--product-details-bg': 'var(--surface)',
});
const BLOCK_SPACING = (top: number, bottom: number) =>
  cssVars({ '--block-spacing-top-desktop': `${top}px`, '--block-spacing-bottom-desktop': `${bottom}px`, '--block-spacing-top-mobile': `${top}px`, '--block-spacing-bottom-mobile': `${bottom}px` });

export function ProductPage() {
  const { slug = '' } = useParams();
  const { data, isPending, isError, error, refetch } = useProduct(slug);

  if (isPending) return <div className="app-page app-page--loading" aria-busy="true" aria-label="Cargando producto" />;
  if (isError && error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (isError || !data) {
    return (
      <div className="app-page">
        <ErrorState message="No pudimos cargar el producto." onRetry={() => void refetch()} />
      </div>
    );
  }
  return <ProductView key={data.id} product={data} />;
}

/** Galería del tema (imagen destacada + columna): primero las fotos del color elegido. */
function Gallery({ images, color, title }: { images: ImageView[]; color: string; title: string }) {
  const ordered = useMemo(() => [...images.filter((i) => i.color === color), ...images.filter((i) => i.color !== color)], [images, color]);
  if (ordered.length === 0) return <div className="media-gallery product-media-block" />;
  return (
    <div
      className="media-gallery product-media-block media-gallery--ratio-portrait_3_4 media-gallery--vertical_split_image media-gallery--feature media-gallery--thumbnail-placement-inside media-gallery--mobile-horizontal-scroll media-gallery--mobile-full-width media-gallery--mobile-thumbnails-hidden"
      style={cssVars({
        '--product-media-radius': '0px',
        '--product-media-gap': '8px',
        '--product-media-ratio': '3 / 4',
        '--product-thumbnail-size': '48px',
        '--feature-rows': Math.max(1, ordered.length - 1),
        ...(ordered.length === 1 ? { '--feature-single': 1 } : {}),
      })}
    >
      <div className="media-main-wrap" id="mainImageWrap">
        <div className={`media-main-stage focus-inset${ordered.length === 1 ? ' media-main-stage--single' : ''}`} role="list" aria-label={title}>
          {ordered.map((image, i) => (
            <div key={image.url} className={`media-main-item${i === 0 ? ' active' : ''}`} role="listitem" data-media-type="image">
              <ThemeImage image={image} sizes={i === 0 ? '(max-width: 767px) 100vw, 36vw' : '(max-width: 767px) 100vw, 20vw'} className="media-main" eager={i === 0} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`product-disclosure product-collapsible block-spacing product-disclosure--divider-top${open ? ' is-open' : ''}`}
      style={{ ...BLOCK_SPACING(14, 14), ...cssVars({ '--theme-content-align-desktop': 'start', '--theme-content-align-mobile': 'start' }) }}
    >
      <button type="button" className="product-disclosure__row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="responsive-heading product-disclosure__heading theme-content-heading type-style type-style--body">{title}</span>
        <span className="product-collapsible__plus" aria-hidden="true">
          <DisclosureIcon />
        </span>
      </button>
      <div className="product-collapsible__body">
        <div className="product-collapsible__content theme-content-description type-style type-style--body rte">{children}</div>
      </div>
    </div>
  );
}

function ProductView({ product }: { product: ProductDetail }) {
  usePageTitle(product.title);
  const [search] = useSearchParams();
  const wanted = search.get('color');
  const initialColor =
    product.options.colors.find((c) => c.toLowerCase() === wanted?.toLowerCase()) ?? product.variants.find((v) => v.available)?.color ?? product.options.colors[0] ?? '';
  const firstSize = (c: string) => product.variants.find((v) => v.color === c && v.available)?.size ?? product.variants.find((v) => v.color === c)?.size ?? null;

  const [color, setColor] = useState(initialColor);
  const [size, setSize] = useState<string | null>(() => firstSize(initialColor));
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'added'>('idle');
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const root = useThemeEnhance<HTMLElement>([product.id]);

  const variant = product.variants.find((v) => v.color === color && v.size === size) ?? null;
  const maxQuantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, variant?.availableQty ?? 1));
  const soldOut = !!variant && !variant.available;
  const priceCents = variant?.priceCents ?? product.priceCents;
  const onSale = !!product.compareAtCents && product.compareAtCents > priceCents;
  const label = !variant ? 'Elegí un talle' : soldOut ? 'Agotado' : status === 'loading' ? 'Agregando…' : status === 'added' ? 'Agregado' : 'Agregar al carrito';

  const chooseColor = (next: string) => {
    setColor(next);
    setError(null);
    setQuantity(1);
    // Conserva el talle si existe con stock en el nuevo color; si no, el primero disponible.
    setSize((current) => (product.variants.find((v) => v.color === next && v.size === current)?.available ? current : firstSize(next)));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!variant || soldOut || status === 'loading') return;
    setError(null);
    setStatus('loading');
    addToThemeCart(variant.id, Math.min(quantity, maxQuantity), button.current)
      .then(() => {
        setStatus('added');
        window.setTimeout(() => setStatus('idle'), 1800);
      })
      .catch((err: unknown) => {
        setStatus('idle');
        setError(err instanceof Error && err.message ? err.message : 'No se pudo agregar el producto al carrito.');
      });
  };

  return (
    <article ref={root}>
      <section className="shopify-section section-product">
        <div className="product-section color-scheme-1" style={SECTION_VARS}>
          <div className="layout-container product-layout layout-container--page layout-container--flush product-layout--content-padded product-layout--details-right product-layout--media-feature product-layout--sticky-details">
            <Gallery images={product.images} color={color} title={product.title} />

            <div className="product-form" id="productFormAnchor" style={FORM_VARS}>
              <form className="shopify-product-form" onSubmit={submit} noValidate>
                <div className="product-title-price product-title-price--inline">
                  <div className="product-title-price__heading">
                    <h1 className="product-title product-title--primary type-style type-style--page-title">{product.title}</h1>
                  </div>
                  <div className="product-detail-price product-detail-price--saving-style_2 product-price-block" role="status" aria-live="polite" aria-atomic="true">
                    <span className="product-detail-price__values">
                      <span className="price-current">
                        <span className="visually-hidden">{onSale ? 'Precio de oferta: ' : 'Precio: '}</span>
                        {formatMoney(priceCents)}
                      </span>
                      {onSale && (
                        <span className="price-compare">
                          <span className="visually-hidden">Precio regular: </span>
                          <s>{formatMoney(product.compareAtCents!)}</s>
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div
                  className="theme-divider-block block-spacing"
                  style={{ ...BLOCK_SPACING(16, 24), ...cssVars({ '--divider-width': '100%', '--divider-thickness': '1px', '--divider-opacity': 0.12, '--divider-justify': 'flex-start' }) }}
                >
                  <span className="theme-divider-block__line" aria-hidden="true" />
                </div>

                <div className="product-form--details-style-2">
                  {product.options.colors.length > 0 && (
                    <div className="variant-group">
                      <div className="variant-label-row">
                        <span className="variant-label" id="product-color-label">
                          Color
                        </span>
                        <span className="variant-selected">{color}</span>
                      </div>
                      <div className="color-swatches" role="group" aria-labelledby="product-color-label">
                        {product.options.colors.map((c) => {
                          const available = product.variants.some((v) => v.color === c && v.available);
                          return (
                            <button
                              key={c}
                              type="button"
                              className={`color-swatch-btn${c === color ? ' active' : ''}${available ? '' : ' unavailable'}`}
                              style={{ ...cssVars({ '--swatch-bg': swatchColor(c) }), backgroundColor: 'var(--swatch-bg)' }}
                              title={c}
                              aria-label={available ? c : `${c}, agotado`}
                              aria-pressed={c === color}
                              onClick={() => chooseColor(c)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="variant-group">
                    <div className="variant-label-row">
                      <span className="variant-label" id="product-size-label">
                        Talle
                      </span>
                      <span className="variant-selected">{size ?? ''}</span>
                    </div>
                    <div className="size-btns" role="group" aria-labelledby="product-size-label">
                      {product.options.sizes.map((s) => {
                        const v = product.variants.find((x) => x.color === color && x.size === s);
                        const available = !!v?.available;
                        return (
                          <button
                            key={s}
                            type="button"
                            className={`size-btn${s === size ? ' active' : ''}${available ? '' : ' unavailable'}`}
                            aria-pressed={s === size}
                            aria-label={available ? `Talle ${s}` : `Talle ${s}, agotado`}
                            disabled={!v}
                            onClick={() => {
                              setSize(s);
                              setQuantity(1);
                              setError(null);
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="product-spacing-block" style={cssVars({ '--product-spacing-top': '20px', '--product-spacing-bottom': '0px' })} aria-hidden="true" />

                <div>
                  <div className="atc-row">
                    <div className="product-quantity-line">
                      <div className="qty-stepper" role="group" aria-label="Cantidad">
                        <button type="button" className="qty-btn focus-inset" aria-label="Restar una unidad" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                          <MinusIcon />
                        </button>
                        <span className="qty-val" aria-live="polite">
                          {Math.min(quantity, maxQuantity)}
                        </span>
                        <button
                          type="button"
                          className="qty-btn focus-inset"
                          aria-label="Sumar una unidad"
                          disabled={quantity >= maxQuantity || soldOut}
                          onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                        >
                          <PlusIcon />
                        </button>
                      </div>
                    </div>
                    <button
                      ref={button}
                      type="submit"
                      className={`atc-btn motion-label-trigger atc-btn--outline${status === 'loading' ? ' loading' : ''}${status === 'added' ? ' added' : ''}`}
                      aria-describedby="product-cart-status"
                      disabled={!variant || soldOut || status === 'loading'}
                    >
                      <span className="atc-label">
                        <MotionLabel>{label}</MotionLabel>
                      </span>
                    </button>
                  </div>
                  <p id="product-cart-status" className="product-form__cart-status" role="alert" aria-atomic="true" hidden={!error}>
                    {error}
                  </p>
                </div>

                {variant && variant.available && variant.availableQty <= 3 && (
                  <div className="inventory-status">
                    <p className="inventory-text">
                      <strong>¡Últimas {variant.availableQty} unidades!</strong>
                    </p>
                  </div>
                )}

                <div className="free-shipping-bar" style={{ ...BLOCK_SPACING(20, 8), ...cssVars({ '--free-shipping-align-desktop': 'start', '--free-shipping-align-mobile': 'start' }) }}>
                  <div className="free-shipping-bar__message-row">
                    <span className="free-shipping-bar__icon">
                      <TruckIcon />
                    </span>
                    <div className="free-shipping-bar__message rte type-style type-style--body">
                      Envío gratis en compras de más de <strong>{formatMoney(FREE_SHIPPING_THRESHOLD_CENTS)}</strong>
                    </div>
                  </div>
                </div>

                <Disclosure title="Descripción" defaultOpen>
                  <p>{product.description}</p>
                </Disclosure>
                {product.materials.length > 0 && (
                  <Disclosure title="Materiales y cuidado">
                    <ul>
                      <li>Materiales: {product.materials.join(', ')}</li>
                      <li>Lavar a mano o en ciclo delicado, con agua fría.</li>
                      <li>No usar secadora. Planchar a baja temperatura.</li>
                    </ul>
                  </Disclosure>
                )}
                <Disclosure title="Envíos y devoluciones">
                  <ul>
                    <li>Envío estándar gratis en compras de más de {formatMoney(FREE_SHIPPING_THRESHOLD_CENTS)}.</li>
                    <li>Envío exprés disponible al finalizar la compra.</li>
                    <li>Cambios y devoluciones dentro de los 30 días.</li>
                  </ul>
                </Disclosure>
              </form>
            </div>
          </div>
        </div>
      </section>

      {product.related.length > 0 && (
        <section className="shopify-section app-related color-scheme-1" aria-labelledby="related-title">
          <div className="layout-container layout-container--page">
            <h2 id="related-title" className="type-style type-style--section-heading app-related__title">
              También te puede gustar
            </h2>
            <div className="products-grid app-related__grid" data-reveal-group="" data-reveal-trigger="scroll">
              {product.related.slice(0, 4).map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}

import { Link } from 'react-router';
import type { ProductCard as ProductCardData } from '@radian/contracts';
import { BagIcon } from './icons';
import { cssVars, PriceBlock, swatchColor, ThemeImage } from './primitives';

const CARD_STYLE = cssVars({
  '--product-card-content-alignment': 'start',
  '--product-card-content-alignment-mobile': 'start',
  '--product-card-variant-swatch-size': '30px',
  '--product-card-variant-text-height': '28px',
  '--product-card-variant-text-padding': '12px',
  '--product-card-variant-text-font-size': '10px',
  '--product-card-gallery-indicator-thickness': '2px',
});

interface Props {
  product: ProductCardData;
  /** Posición en la grilla: escalona la animación de aparición como en el tema. */
  index?: number;
  sizes?: string;
  eager?: boolean;
}

export const productUrl = (slug: string, color?: string) => `/products/${encodeURIComponent(slug)}${color ? `?color=${encodeURIComponent(color)}` : ''}`;

/** Tarjeta de producto con el markup del tema (imagen con hover, insignias, precio y colores). */
export function ProductCard({ product: p, index = 0, sizes = '(max-width: 767px) calc(100vw / 2), calc(100vw / 4)', eager }: Props) {
  const url = productUrl(p.slug);
  const onSale = !!p.compareAtCents && p.compareAtCents > p.priceCents;
  return (
    <div
      className="product-card product-card--has-variant-tray"
      data-reveal-item=""
      data-product-card=""
      data-product-card-variant-style="hover_reveal"
      data-product-card-variant-overlap="true"
      data-product-card-content-alignment="left"
      data-product-card-content-alignment-mobile="left"
      data-product-card-hover-effect="instant"
      data-product-card-gallery-indicator-background="true"
      data-product-card-mobile-quick-view-mode="disabled"
      data-product-card-desktop-quick-view="hover"
      style={{ ...CARD_STYLE, ...cssVars({ '--reveal-delay': `${Math.min(index, 7) * 50}ms` }) }}
    >
      <div
        className={`product-card-image product-card-image--portrait_3_4${p.hoverImage ? ' product-card-image--has-hover' : ''}`}
        style={cssVars({ '--product-card-image-ratio': '0.7466666666666667' })}
      >
        <Link className="product-card-link focus-inset" to={url} data-product-card-link="" aria-hidden="true" tabIndex={-1}>
          {p.image && <ThemeImage image={p.image} sizes={sizes} alt={p.title} eager={eager} />}
          {p.hoverImage && <ThemeImage image={p.hoverImage} sizes={sizes} alt="" className="product-card-image__hover" />}
          <div className="product-badges product-badges--media product-badges--card" hidden={p.available && !onSale}>
            <span className="product-badge product-badge--sold-out" hidden={p.available}>
              Agotado
            </span>
            <span className="product-badge product-badge--sale" hidden={!onSale || !p.available}>
              Oferta
            </span>
          </div>
        </Link>
        <button type="button" className="quick-view-btn" data-quick-view="" data-product-url={url} data-product-card-quick-view="" aria-label={`Ver ${p.title}`}>
          <span className="quick-view-btn__magnetic-symbol" aria-hidden="true">
            <span className="quick-view-btn__plus-icon">+</span>
            <span className="quick-view-btn__bag-icon">
              <BagIcon />
            </span>
          </span>
          <span className="quick-view-btn__text" aria-hidden="true">
            <span className="quick-view-btn__text-label quick-view-btn__text-label--quick-view">Ver producto</span>
            <span className="quick-view-btn__text-label quick-view-btn__text-label--choose">Elegir opciones</span>
          </span>
        </button>
      </div>
      <div className="product-card-meta">
        <div className="product-card-info">
          <div className="product-card__title-price">
            <p className="product-title type-style type-style--caption">
              <Link className="product-card-info__link" to={url} data-product-card-link="">
                {p.title}
              </Link>
            </p>
            <div className="product-card__meta-slot">
              <div className="product-card__meta-viewport">
                <div className="product-card__meta-track">
                  <div className="product-price-row" data-product-card-price="">
                    <PriceBlock priceCents={p.priceCents} compareAtCents={p.compareAtCents} />
                  </div>
                  {p.colors.length > 0 && (
                    <div className="product-card-variant-tray" data-product-card-variant-tray="">
                      <div className="product-card-variant-tray__inner product-swatches" aria-label="Color" role="group">
                        {p.colors.map((color, i) => (
                          <Link
                            key={color}
                            className={`swatch${i === 0 ? ' active' : ''}`}
                            to={productUrl(p.slug, color)}
                            title={color}
                            aria-label={`${p.title} en ${color}`}
                            style={{ ...cssVars({ '--option-index': i, '--swatch-bg': swatchColor(color) }), backgroundColor: 'var(--swatch-bg)' }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { CSSProperties } from 'react';
import type { ImageView } from '@radian/contracts';
import { formatMoney } from '../shared/format/money';

/** Color de muestra por nombre de variante (los mismos tonos que usa la tienda original). */
const SWATCHES: Record<string, string> = {
  'obsidian black': '#000000',
  'oxblood burgundy': '#4A0F1B',
  'bone ivory': '#E8E1D5',
  'chocolate brown': '#5C3A2E',
  'charcoal grey': '#3A3A3C',
  'onyx black': '#111111',
  black: '#111111',
};
export const swatchColor = (name: string) => SWATCHES[name.trim().toLowerCase()] ?? '#8a8a8a';

/** Variables CSS como `style` (React tipa `style` sin propiedades personalizadas). */
export const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

/**
 * Texto de botón del tema. El tema anima estas etiquetas reemplazando su contenido, así que React
 * las trata como HTML opaco y las vuelve a crear (por `key`) cuando cambia el texto.
 */
export function MotionLabel({ children }: { children: string }) {
  return (
    <span
      key={children}
      className="motion-label"
      data-motion-label=""
      data-motion-label-effect="inherit"
      data-motion-label-context="auto"
      dangerouslySetInnerHTML={{ __html: `<span class="motion-label__canonical" data-motion-label-canonical="">${escapeHtml(children)}</span>` }}
    />
  );
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

interface ThemeImageProps {
  image: ImageView;
  sizes: string;
  className?: string | undefined;
  eager?: boolean | undefined;
  alt?: string | undefined;
}

/** Imagen responsiva servida por el backend (WebP en varios anchos). */
export function ThemeImage({ image, sizes, className, eager, alt }: ThemeImageProps) {
  return (
    <img
      src={image.url}
      srcSet={image.srcset.map((s) => `${s.url} ${s.width}w`).join(', ')}
      sizes={sizes}
      alt={alt ?? image.alt}
      width={image.width}
      height={image.height}
      loading={eager ? 'eager' : 'lazy'}
      {...(eager ? { fetchPriority: 'high' as const } : {})}
      className={className}
    />
  );
}

/** Precio con el markup del tema: oferta + precio anterior tachado, o precio regular. */
export function PriceBlock({ priceCents, compareAtCents }: { priceCents: number; compareAtCents: number | null }) {
  if (compareAtCents && compareAtCents > priceCents) {
    return (
      <div className="price-block price-block--product-grid" data-on-sale="">
        <span className="price-block__sale">
          <span className="visually-hidden">Precio de oferta: </span>
          {formatMoney(priceCents)}
        </span>
        <span className="price-block__compare">
          <span className="visually-hidden">Precio regular: {formatMoney(compareAtCents)}</span>
          <s aria-hidden="true">{formatMoney(compareAtCents)}</s>
        </span>
      </div>
    );
  }
  return (
    <div className="price-block price-block--product-grid">
      <span className="price-block__regular">
        <span className="visually-hidden">Precio regular: </span>
        {formatMoney(priceCents)}
      </span>
    </div>
  );
}

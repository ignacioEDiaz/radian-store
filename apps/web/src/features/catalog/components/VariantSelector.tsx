import type { ProductDetail } from '@radian/contracts';
import styles from '../catalog.module.css';

interface Props {
  product: ProductDetail;
  color: string;
  size: string | null;
  onColor: (color: string) => void;
  onSize: (size: string) => void;
}

/** Selector accesible (radios) con disponibilidad por combinación color × talle. */
export function VariantSelector({ product, color, size, onColor, onSize }: Props) {
  const variantFor = (s: string) => product.variants.find((v) => v.color === color && v.size === s);
  return (
    <div className={styles.selector}>
      <fieldset>
        <legend>
          Color: <strong>{color}</strong>
        </legend>
        <div className={styles.options}>
          {product.options.colors.map((c) => (
            <label key={c} className={`${styles.option} ${c === color ? styles.optionActive : ''}`}>
              <input type="radio" name="color" value={c} checked={c === color} onChange={() => onColor(c)} className="visually-hidden" />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Talle</legend>
        <div className={styles.options}>
          {product.options.sizes.map((s) => {
            const v = variantFor(s);
            const soldOut = !v?.available;
            return (
              <label key={s} className={`${styles.option} ${s === size ? styles.optionActive : ''} ${soldOut ? styles.optionDisabled : ''}`}>
                <input type="radio" name="size" value={s} checked={s === size} disabled={soldOut} onChange={() => onSize(s)} className="visually-hidden" aria-label={soldOut ? `${s} (agotado)` : s} />
                {s}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

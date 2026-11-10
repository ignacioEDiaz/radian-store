import type { ImageView } from '@radian/contracts';
import { ResponsiveImage } from './ResponsiveImage';
import styles from '../catalog.module.css';

/** Ordena primero las imágenes del color elegido, luego las genéricas y al final las de otros colores. */
export function orderForColor(images: ImageView[], color: string): ImageView[] {
  const rank = (i: ImageView) => (i.color === color ? 0 : i.color === null ? 1 : 2);
  return [...images].sort((a, b) => rank(a) - rank(b));
}

export function Gallery({ images, color }: { images: ImageView[]; color: string }) {
  const ordered = orderForColor(images, color);
  return (
    <section className={styles.gallery} aria-label="Galería de imágenes">
      {ordered.map((img, i) => (
        <ResponsiveImage key={img.url} image={img} sizes="(min-width: 900px) 30vw, 100vw" priority={i === 0} />
      ))}
    </section>
  );
}

import type { ImageView } from '@radian/contracts';

interface Props {
  image: ImageView;
  sizes: string;
  /** Imágenes de la primera pantalla: carga inmediata y alta prioridad. */
  priority?: boolean;
  className?: string | undefined;
  alt?: string | undefined;
}

/** `srcset` con los anchos generados por el backend; el navegador elige según el dispositivo. */
export function ResponsiveImage({ image, sizes, priority = false, className, alt }: Props) {
  return (
    <img
      src={image.url}
      srcSet={image.srcset.map((s) => `${s.url} ${s.width}w`).join(', ')}
      sizes={sizes}
      alt={alt ?? image.alt}
      width={image.width}
      height={image.height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={className}
    />
  );
}

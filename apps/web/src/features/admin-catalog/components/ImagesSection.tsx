import { useState, type ChangeEvent } from 'react';
import type { AdminImage, AdminProduct } from '@radian/contracts';
import { adminCatalogService } from '../services/adminCatalogService';
import { useProductCommand } from '../hooks/useAdminCatalog';
import { CommandError } from './CommandError';
import { reportIfReadOnly } from '../../../shared/api/readOnly';
import styles from '../admin.module.css';

export function ImagesSection({ product }: { product: AdminProduct }) {
  const images = [...product.images].sort((a, b) => a.position - b.position);
  const colors = [...new Set(product.variants.map((v) => v.color))];
  const [uploadError, setUploadError] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);

  const attach = useProductCommand(product.id, (mediaId: string) =>
    adminCatalogService.attachImage(product.id, { expectedVersion: product.version, mediaId, alt: product.title, color: null }),
  );
  const reorder = useProductCommand(product.id, (imageIds: string[]) => adminCatalogService.reorderImages(product.id, { expectedVersion: product.version, imageIds }));
  const update = useProductCommand(product.id, (i: { imageId: string; alt?: string; color?: string | null }) =>
    adminCatalogService.updateImage(product.id, i.imageId, { expectedVersion: product.version, ...(i.alt !== undefined ? { alt: i.alt } : {}), ...(i.color !== undefined ? { color: i.color } : {}) }),
  );
  const remove = useProductCommand(product.id, (imageId: string) => adminCatalogService.removeImage(product.id, imageId, product.version));

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const media = await adminCatalogService.uploadMedia(file);
      await attach.mutateAsync(media.id);
    } catch (err) {
      reportIfReadOnly(err);
      setUploadError(err);
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, by: -1 | 1) {
    const ids = images.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    reorder.mutate(ids);
  }

  return (
    <section className={styles.section} aria-labelledby="images-title">
      <h2 id="images-title">Imágenes</h2>
      <p className={styles.muted}>La primera es la principal. JPEG, PNG o WebP de hasta 10 MB; se generan tamaños optimizados.</p>
      <CommandError error={uploadError ?? attach.error ?? reorder.error ?? update.error ?? remove.error} productId={product.id} />
      <ol className={styles.images}>
        {images.map((img, i) => (
          <ImageCard
            key={img.id}
            image={img}
            colors={colors}
            first={i === 0}
            last={i === images.length - 1}
            onUp={() => move(i, -1)}
            onDown={() => move(i, 1)}
            onAlt={(alt) => alt !== img.alt && update.mutate({ imageId: img.id, alt })}
            onColor={(color) => update.mutate({ imageId: img.id, color })}
            onRemove={() => remove.mutate(img.id)}
          />
        ))}
      </ol>
      <label className="btn btn--ghost" aria-busy={uploading}>
        {uploading ? 'Subiendo…' : 'Subir imagen'}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void onFile(e)} className="visually-hidden" disabled={uploading} />
      </label>
    </section>
  );
}

function ImageCard(p: {
  image: AdminImage;
  colors: string[];
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onAlt: (alt: string) => void;
  onColor: (color: string | null) => void;
  onRemove: () => void;
}) {
  const [alt, setAlt] = useState(p.image.alt);
  const name = p.image.alt || 'sin texto';
  return (
    <li className={styles.imageCard}>
      <img src={p.image.url} alt={p.image.alt} loading="lazy" />
      <label className="visually-hidden" htmlFor={`alt-${p.image.id}`}>
        Texto alternativo
      </label>
      <input id={`alt-${p.image.id}`} value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={() => p.onAlt(alt)} placeholder="Texto alternativo" />
      <label className="visually-hidden" htmlFor={`color-${p.image.id}`}>
        Color
      </label>
      <select id={`color-${p.image.id}`} value={p.image.color ?? ''} onChange={(e) => p.onColor(e.target.value || null)}>
        <option value="">Todos los colores</option>
        {p.colors.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <div className={styles.iconRow}>
        <button type="button" className={`btn btn--ghost ${styles.small}`} onClick={p.onUp} disabled={p.first} aria-label={`Subir "${name}"`}>
          ↑
        </button>
        <button type="button" className={`btn btn--ghost ${styles.small}`} onClick={p.onDown} disabled={p.last} aria-label={`Bajar "${name}"`}>
          ↓
        </button>
        <button type="button" className={`btn btn--ghost ${styles.small}`} onClick={p.onRemove} aria-label={`Quitar "${name}"`}>
          Quitar
        </button>
      </div>
    </li>
  );
}

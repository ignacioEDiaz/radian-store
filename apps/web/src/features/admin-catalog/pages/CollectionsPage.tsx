import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminCollection, AdminProductRow } from '@radian/contracts';
import { queryKeys } from '../../../shared/api/queryKeys';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { TextField } from '../../../shared/ui/TextField';
import { adminCatalogService } from '../services/adminCatalogService';
import { useAdminCollections, useAdminProducts } from '../hooks/useAdminCatalog';
import { CommandError } from '../components/CommandError';
import styles from '../admin.module.css';

export function CollectionsPage() {
  const collections = useAdminCollections();
  const products = useAdminProducts({ page: 1 });
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: adminCatalogService.createCollection,
    onSuccess: (c) => {
      queryClient.setQueryData<AdminCollection[]>(queryKeys.admin.collections, (list) => [...(list ?? []), c]);
      setTitle('');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length >= 2) create.mutate({ title });
  }

  return (
    <section className={styles.page} aria-labelledby="collections-title">
      <h1 id="collections-title">Colecciones</h1>
      <form onSubmit={submit} className={`${styles.inline} ${styles.section}`} aria-label="Nueva colección">
        <TextField label="Título de la colección" value={title} onChange={setTitle} />
        <button type="submit" className="btn" disabled={create.isPending}>
          Crear colección
        </button>
      </form>
      <CommandError error={create.error} />
      {collections.isError && <ErrorState message="No se pudieron cargar las colecciones" onRetry={() => void collections.refetch()} />}
      {collections.data?.map((c) => <CollectionCard key={c.id} collection={c} products={products.data?.items ?? []} />)}
    </section>
  );
}

function CollectionCard({ collection, products }: { collection: AdminCollection; products: AdminProductRow[] }) {
  const queryClient = useQueryClient();
  const [ids, setIds] = useState(collection.productIds);
  const [toAdd, setToAdd] = useState('');
  const byId = new Map(products.map((p) => [p.id, p]));
  const save = useMutation({
    mutationFn: () => adminCatalogService.setCollectionProducts(collection.id, { expectedVersion: collection.version, productIds: ids }),
    onSuccess: (c) => queryClient.setQueryData<AdminCollection[]>(queryKeys.admin.collections, (list) => list?.map((x) => (x.id === c.id ? c : x))),
  });
  const headingId = `col-${collection.id}`;
  const move = (i: number, by: -1 | 1) =>
    setIds((list) => {
      const next = [...list];
      const [m] = next.splice(i, 1);
      next.splice(i + by, 0, m!);
      return next;
    });

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId}>{collection.title}</h2>
      <p className={styles.muted}>/colecciones/{collection.slug}</p>
      <CommandError error={save.error} />
      <ol>
        {ids.map((id, i) => (
          <li key={id} className={styles.inline} style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{byId.get(id)?.title ?? id}</span>
            <button type="button" className={`btn btn--ghost ${styles.small}`} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${byId.get(id)?.title ?? ''}`}>
              ↑
            </button>
            <button type="button" className={`btn btn--ghost ${styles.small}`} disabled={i === ids.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${byId.get(id)?.title ?? ''}`}>
              ↓
            </button>
            <button type="button" className={`btn btn--ghost ${styles.small}`} onClick={() => setIds((l) => l.filter((x) => x !== id))}>
              Quitar
            </button>
          </li>
        ))}
      </ol>
      <div className={styles.inline}>
        <div className="field">
          <label htmlFor={`add-${collection.id}`}>Agregar producto</label>
          <select
            id={`add-${collection.id}`}
            value={toAdd}
            onChange={(e) => {
              const id = e.target.value;
              if (id) setIds((l) => (l.includes(id) ? l : [...l, id]));
              setToAdd('');
            }}
          >
            <option value="">Elegí un producto…</option>
            {products
              .filter((p) => !ids.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </div>
        <button type="button" className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
          Guardar productos
        </button>
      </div>
    </section>
  );
}

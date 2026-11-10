import { useState, type FormEvent } from 'react';
import type { AdminProduct, AdminVariant } from '@radian/contracts';
import { formatMoney } from '../../../shared/format/money';
import { adminCatalogService } from '../services/adminCatalogService';
import { useAdjustStock, useProductCommand } from '../hooks/useAdminCatalog';
import { CommandError } from './CommandError';
import styles from '../admin.module.css';

export function VariantsSection({ product }: { product: AdminProduct }) {
  const add = useProductCommand(product.id, (v: { sku: string; color: string; size: string; initialStock: number }) =>
    adminCatalogService.addVariant(product.id, { expectedVersion: product.version, ...v }),
  );
  const remove = useProductCommand(product.id, (variantId: string) => adminCatalogService.removeVariant(product.id, variantId, product.version));
  const adjust = useAdjustStock(product.id);
  const [form, setForm] = useState({ sku: '', color: '', size: '', initialStock: '0' });

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate(
      { sku: form.sku, color: form.color, size: form.size, initialStock: Number(form.initialStock) || 0 },
      { onSuccess: () => setForm({ sku: '', color: form.color, size: '', initialStock: '0' }) },
    );
  }

  return (
    <section className={styles.section} aria-labelledby="variants-title">
      <h2 id="variants-title">Variantes y stock</h2>
      <CommandError error={add.error ?? remove.error ?? adjust.error} productId={product.id} />
      {product.variants.length === 0 ? (
        <p className={styles.muted}>Todavía no hay variantes.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">Color</th>
              <th scope="col">Talle</th>
              <th scope="col">Precio</th>
              <th scope="col">Físico</th>
              <th scope="col">Reservado</th>
              <th scope="col">Ajustar stock</th>
              <th scope="col">
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((v) => (
              <VariantRow
                key={v.id}
                variant={v}
                price={formatMoney(v.priceCents ?? product.priceCents)}
                onAdjust={(delta) => adjust.mutate({ variantId: v.id, delta })}
                onRemove={() => remove.mutate(v.id)}
                busy={adjust.isPending || remove.isPending}
              />
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={submit} aria-label="Nueva variante" className={styles.inline} style={{ marginTop: 'var(--space-6)' }}>
        {(
          [
            ['sku', 'SKU'],
            ['color', 'Color'],
            ['size', 'Talle'],
          ] as const
        ).map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={`new-variant-${key}`}>{label}</label>
            <input id={`new-variant-${key}`} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} required />
          </div>
        ))}
        <div className="field">
          <label htmlFor="new-variant-stock">Stock inicial</label>
          <input id="new-variant-stock" type="number" min={0} value={form.initialStock} onChange={(e) => setForm((f) => ({ ...f, initialStock: e.target.value }))} />
        </div>
        <button type="submit" className="btn" disabled={add.isPending}>
          Agregar variante
        </button>
      </form>
    </section>
  );
}

function VariantRow({ variant: v, price, onAdjust, onRemove, busy }: { variant: AdminVariant; price: string; onAdjust: (delta: number) => void; onRemove: () => void; busy: boolean }) {
  const [delta, setDelta] = useState('');
  const n = Number(delta);
  return (
    <tr>
      <th scope="row">{v.sku}</th>
      <td>{v.color}</td>
      <td>{v.size}</td>
      <td>{price}</td>
      <td>{v.onHand}</td>
      <td>{v.reserved}</td>
      <td>
        <div className={styles.iconRow}>
          <label className="visually-hidden" htmlFor={`adj-${v.id}`}>
            Ajuste para {v.sku}
          </label>
          <input id={`adj-${v.id}`} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="±" style={{ width: 72 }} />
          <button
            type="button"
            className={`btn btn--ghost ${styles.small}`}
            disabled={busy || !Number.isInteger(n) || n === 0}
            onClick={() => {
              onAdjust(n);
              setDelta('');
            }}
          >
            Aplicar
          </button>
        </div>
      </td>
      <td>
        <button type="button" className={`btn btn--ghost ${styles.small}`} onClick={onRemove} disabled={busy} aria-label={`Quitar ${v.sku}`}>
          Quitar
        </button>
      </td>
    </tr>
  );
}

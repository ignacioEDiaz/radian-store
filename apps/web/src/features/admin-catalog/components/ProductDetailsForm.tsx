import { useState, type FormEvent } from 'react';
import { createProductRequestSchema, type AdminProduct, type CreateProductRequest } from '@radian/contracts';
import { validate, type FieldErrors } from '../../../shared/forms/validate';
import { centsToInput, parseMoneyToCents } from '../../../shared/format/money';
import { TextField } from '../../../shared/ui/TextField';
import styles from '../admin.module.css';

interface Props {
  initial?: AdminProduct;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: CreateProductRequest) => void;
}

/** Formulario de datos comerciales (crear y editar). Valida con el mismo esquema que la API. */
export function ProductDetailsForm({ initial, submitLabel, pending, onSubmit }: Props) {
  const [v, setV] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    productType: initial?.productType ?? '',
    materials: initial?.materials.join(', ') ?? '',
    price: centsToInput(initial?.priceCents ?? null),
    compareAt: centsToInput(initial?.compareAtCents ?? null),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (k: keyof typeof v) => (value: string) => setV((s) => ({ ...s, [k]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const priceCents = parseMoneyToCents(v.price);
    const compareAtCents = v.compareAt.trim() ? parseMoneyToCents(v.compareAt) : null;
    const local: FieldErrors = {};
    if (priceCents === null) local['priceCents'] = 'Ingresá un precio válido (p. ej. 450 o 450,50)';
    if (v.compareAt.trim() && compareAtCents === null) local['compareAtCents'] = 'Importe inválido';
    const payload = {
      title: v.title,
      description: v.description,
      productType: v.productType,
      materials: v.materials.split(',').map((m) => m.trim()).filter(Boolean),
      tags: initial?.tags ?? [],
      priceCents: priceCents ?? 0,
      compareAtCents,
    };
    const result = validate(createProductRequestSchema, payload);
    const all = { ...(result.errors ?? {}), ...local };
    setErrors(all);
    if (Object.keys(all).length === 0) onSubmit(payload);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Datos del producto">
      <div className={styles.grid2}>
        <TextField label="Título" value={v.title} error={errors['title']} onChange={set('title')} />
        <TextField label="Tipo de producto" value={v.productType} error={errors['productType']} onChange={set('productType')} placeholder="Tops, Footwear…" />
        <TextField label="Precio (US$)" inputMode="decimal" value={v.price} error={errors['priceCents']} onChange={set('price')} />
        <TextField label="Precio anterior (US$, opcional)" inputMode="decimal" value={v.compareAt} error={errors['compareAtCents']} onChange={set('compareAt')} />
      </div>
      <TextField label="Materiales (separados por coma)" value={v.materials} onChange={set('materials')} />
      <div className="field">
        <label htmlFor="product-description">Descripción</label>
        <textarea id="product-description" rows={4} value={v.description} onChange={(e) => set('description')(e.target.value)} />
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}

import type { FieldErrors } from '../../../shared/forms/validate';
import { TextField } from '../../../shared/ui/TextField';

export interface AddressValues {
  recipient: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
}

export const emptyAddress: AddressValues = { recipient: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: '', phone: '' };

/** Campos de dirección reutilizables (perfil y checkout). `prefix` = path de errores (p. ej. "defaultAddress"). */
export function AddressFields({
  values,
  onChange,
  errors,
  prefix,
}: {
  values: AddressValues;
  onChange: (values: AddressValues) => void;
  errors: FieldErrors;
  prefix: string;
}) {
  const field = (name: keyof AddressValues, label: string, autoComplete: string, extra: { type?: string } = {}) => (
    <TextField
      label={label}
      autoComplete={autoComplete}
      value={values[name]}
      error={errors[`${prefix}.${name}`]}
      onChange={(v) => onChange({ ...values, [name]: v })}
      {...extra}
    />
  );
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      {field('recipient', 'Destinatario', 'name')}
      {field('line1', 'Dirección', 'address-line1')}
      {field('line2', 'Piso / depto (opcional)', 'address-line2')}
      {field('city', 'Ciudad', 'address-level2')}
      {field('region', 'Provincia / estado', 'address-level1')}
      {field('postalCode', 'Código postal', 'postal-code')}
      {field('country', 'País (código de 2 letras)', 'country')}
      {field('phone', 'Teléfono', 'tel', { type: 'tel' })}
    </fieldset>
  );
}

/** Convierte el formulario a la forma del contrato (line2 vacío se omite). */
export function toAddressInput(values: AddressValues) {
  const { line2, ...rest } = values;
  return line2.trim() ? { ...rest, line2 } : rest;
}

export const isBlankAddress = (values: AddressValues) => Object.values(values).every((v) => v.trim() === '');

const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', currencyDisplay: 'code', minimumFractionDigits: 2 });

/** 45000 → "USD 450,00" */
export function formatMoney(cents: number): string {
  return fmt.format(cents / 100).replace(/\s/g, ' ');
}

/** "450" | "450,50" | "450.50" → 45050. Devuelve null si no es un importe válido. */
export function parseMoneyToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export const centsToInput = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));

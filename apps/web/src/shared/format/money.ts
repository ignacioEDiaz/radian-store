const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 45000 → "US$ 450,00" (el mismo formato que usa la tienda en todas sus secciones). */
export function formatMoney(cents: number): string {
  return `US$ ${fmt.format(cents / 100)}`;
}

/** "450" | "450,50" | "450.50" → 45050. Devuelve null si no es un importe válido. */
export function parseMoneyToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export const centsToInput = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));

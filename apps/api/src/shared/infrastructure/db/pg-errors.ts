/** Códigos SQLSTATE de PostgreSQL que traducimos a errores de dominio. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && (constraint === undefined || e.constraint === constraint);
}

export function isCheckViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23514' && (constraint === undefined || e.constraint === constraint);
}

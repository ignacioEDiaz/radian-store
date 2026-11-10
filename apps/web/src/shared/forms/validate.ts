import type { ZodType } from 'zod';

export type FieldErrors = Record<string, string>;

/** Valida con el mismo esquema Zod del contrato que usa el backend. */
export function validate<T>(schema: ZodType<T>, values: unknown): { data: T; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_form';
    errors[path] ??= issue.message;
  }
  return { data: null, errors };
}

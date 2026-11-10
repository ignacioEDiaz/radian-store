import type { z } from 'zod';
import { ValidationError } from '../../domain/errors.js';

function parseWith<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path.join('.') || '(body)', message: i.message })),
    );
  }
  return result.data;
}

/** Valida el body en el borde HTTP (Constitución VI). */
export const parseBody = parseWith;
export const parseQuery = parseWith;
export const parseParams = parseWith;

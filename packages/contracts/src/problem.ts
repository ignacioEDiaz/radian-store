import { z } from 'zod';

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  code: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type Problem = z.infer<typeof problemSchema>;

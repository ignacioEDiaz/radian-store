import { z } from 'zod';

export const componentStatusSchema = z.object({
  status: z.enum(['up', 'down', 'degraded']),
  latencyMs: z.number().nonnegative(),
  detail: z.string().optional(),
});

export const poolStatsSchema = z.object({
  total: z.number().int(),
  idle: z.number().int(),
  inUse: z.number().int(),
  waiting: z.number().int(),
  max: z.number().int(),
});

export const healthLiveSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
});

export const healthReportSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    writeDb: componentStatusSchema,
    readDb: componentStatusSchema,
    cache: componentStatusSchema,
    projector: componentStatusSchema.extend({
      lagSeconds: z.number().nonnegative(),
      pending: z.number().int().nonnegative(),
    }),
  }),
  pools: z.object({ write: poolStatsSchema, read: poolStatsSchema }),
});

export type ComponentStatus = z.infer<typeof componentStatusSchema>;
export type PoolStats = z.infer<typeof poolStatsSchema>;
export type HealthLive = z.infer<typeof healthLiveSchema>;
export type HealthReport = z.infer<typeof healthReportSchema>;

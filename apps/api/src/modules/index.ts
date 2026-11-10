import { createIdentityModule } from './identity/index.js';
import type { BoundedContext, ModuleContext } from './types.js';

export type { BoundedContext, ModuleContext } from './types.js';

/** Composition root de los bounded contexts. */
export function createContexts(ctx: ModuleContext): BoundedContext[] {
  const identity = createIdentityModule(ctx, ctx.infra.redis);
  return [identity];
}

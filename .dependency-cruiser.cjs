/**
 * Reglas de arquitectura (Constitución II y III). `npm run arch` falla si alguna se viola.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'El dominio no depende de aplicación, infraestructura ni de librerías técnicas.',
      severity: 'error',
      from: { path: '(^|/)src/(shared|modules/[^/]+)/domain/' },
      to: {
        path: [
          '(^|/)src/(shared|modules/[^/]+)/(application|infrastructure)/',
          'node_modules/(fastify|pg|ioredis|pino|prom-client|sharp|jose|@node-rs|@fastify)',
        ],
      },
    },
    {
      name: 'application-not-infrastructure',
      comment: 'Los casos de uso dependen de puertos, no de adaptadores.',
      severity: 'error',
      from: { path: '(^|/)src/(shared|modules/[^/]+)/application/' },
      to: {
        path: [
          '(^|/)src/(shared|modules/[^/]+)/infrastructure/',
          'node_modules/(fastify|pg|ioredis|pino|prom-client|sharp|jose|@node-rs|@fastify)',
        ],
      },
    },
    {
      name: 'no-cross-context-domain',
      comment: 'Un bounded context no importa el dominio ni la aplicación de otro (solo eventos/puertos).',
      severity: 'error',
      from: { path: '(^|/)src/modules/([^/]+)/' },
      to: {
        path: '(^|/)src/modules/([^/]+)/(domain|application)/',
        pathNot: '(^|/)src/modules/$2/',
      },
    },
    {
      name: 'queries-read-only',
      comment: 'CQRS: los query handlers no usan repositorios de escritura.',
      severity: 'error',
      from: { path: '(^|/)application/queries/' },
      to: { path: '(-repository|unit-of-work)\\.ts$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'apps/api/tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['source', 'import', 'default'] },
  },
};

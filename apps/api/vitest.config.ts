import { defineConfig } from 'vitest/config';

const resolve = { conditions: ['source'] };

export default defineConfig({
  resolve,
  ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/projector-main.ts', 'src/scripts/**'],
      thresholds: {
        lines: 80,
        'src/**/domain/**': { lines: 90 },
        'src/**/application/**': { lines: 90 },
      },
    },
    projects: [
      {
        resolve,
        ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve,
        ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
        test: { name: 'contract', include: ['test/contract/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve,
        ssr: { resolve: { conditions: ['source'], externalConditions: ['source'] } },
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/support/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});

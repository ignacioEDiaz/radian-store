/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themeShell } from './theme/vite-plugin.ts';

const apiTarget = process.env['VITE_API_PROXY'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), themeShell()],
  resolve: { conditions: ['source'] },
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/media': apiTarget,
      '/health': apiTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'theme/**/*.test.ts'],
    css: false,
  },
});

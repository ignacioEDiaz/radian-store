import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '.specify/**',
      '.claude/**',
      'infra/**',
      // Archivos del tema original (terceros): se sirven tal cual, no se lintean ni formatean.
      'apps/web/public/**',
      '**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Usá httpClient (shared/api/httpClient.ts).' },
      ],
    },
  },
  {
    files: ['apps/web/src/shared/api/httpClient.ts', 'apps/web/**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
);

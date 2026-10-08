import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'web/src/vendor/**', 'web/public/ruffle/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TODO: React Compiler rules that arrived with eslint-plugin-react-hooks 7; existing code
      // predates them. Restore to error once the flagged hooks are rewritten.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Ceilings, not targets: set just above where the code stood when it was last
    // tidied, so a function only crosses one by growing into a new god function.
    files: ['server/src/**/*.ts', 'web/src/**/*.{ts,tsx}', 'packages/shared/src/**/*.ts'],
    rules: {
      complexity: ['error', 30],
      'max-lines-per-function': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      'max-params': ['error', 5],
    },
  },
  {
    // Development helpers: plain Node scripts that are expected to print.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Layering: routes orchestrate, services own logic, adapters own I/O.
    // A route that reaches for the filesystem or spawns a process has skipped a layer.
    files: ['server/src/**/routes.ts', 'server/src/**/*.routes.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:fs',
              message: 'Routes must go through a service, not touch the filesystem.',
            },
            {
              name: 'node:fs/promises',
              message: 'Routes must go through a service, not touch the filesystem.',
            },
            {
              name: 'node:child_process',
              message: 'Routes must not spawn processes; use an adapter.',
            },
          ],
        },
      ],
    },
  },
  {
    // Adapters wrap the outside world and must not depend on business logic.
    files: ['server/src/adapters/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/modules/**'], message: 'Adapters must not import services.' }] },
      ],
    },
  },
  prettier,
);

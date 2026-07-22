import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@hearth/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});

import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** In development the API is proxied so the browser sees one origin, as it does behind Caddy. */
export default defineConfig(({ command, mode }) => {
  const envDir = fileURLToPath(new URL('../', import.meta.url));
  // Same files as the server: .env, plus .env.development under `vite` (dev), which lifts every limit.
  const env = loadEnv(mode, envDir, 'HEARTH_');
  const apiTarget = env.HEARTH_DEV_API || `http://127.0.0.1:${env.HEARTH_PORT || 17010}`;
  const apiPrefix = env.HEARTH_API_PREFIX || '/hearth-api';

  return {
    envDir,
    // Only HEARTH_WEB_* reaches the bundle; everything else in .env stays on the server.
    envPrefix: 'HEARTH_WEB_',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Relative asset URLs: one bundle works under any mount prefix.
    base: command === 'build' ? './' : '/',
    server: {
      port: Number(env.HEARTH_DEV_WEB_PORT || 17011),
      strictPort: true,
      proxy: {
        [apiPrefix]: {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['@tanstack/react-router', '@tanstack/react-query'],
          },
        },
      },
    },
  };
});

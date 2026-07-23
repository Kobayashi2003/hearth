import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The frontend is a static bundle served by the Caddy edge, so nothing here
 * sits in the request path at runtime. In development the API is proxied so the
 * browser sees one origin and the session cookie behaves exactly as it will in
 * production — including for media streams.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../', import.meta.url)), 'HEARTH_');
  const apiTarget = env.HEARTH_DEV_API ?? 'http://127.0.0.1:5311';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Built assets use relative URLs, so one bundle works both standalone and
    // mounted under the AppGateway prefix — the prefix is discovered at
    // runtime. The dev server always serves from the origin root.
    base: command === 'build' ? './' : '/',
    server: {
      port: 5110,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
          // Range streams must not be buffered by the dev proxy.
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // The heavy viewers are rarely opened; keeping them out of the entry
          // chunk is what keeps first paint fast on a phone.
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['@tanstack/react-router', '@tanstack/react-query'],
          },
        },
      },
    },
  };
});

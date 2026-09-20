import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './web',
  base: '/phone/',
  build: {
    outDir: resolve(__dirname, '../relay/public/phone'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@fire-stick/types': resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws':  { target: 'ws://localhost:3001', ws: true },
    },
  },
});

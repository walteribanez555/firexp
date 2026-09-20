import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Resolve workspace packages from source so Vite/Rollup can tree-shake
      // them as ESM instead of trying to analyse the CJS dist output.
      '@fire-stick/story-graph': path.resolve(
        __dirname,
        '../../packages/story-graph/src/index.ts',
      ),
      '@fire-stick/types': path.resolve(
        __dirname,
        '../../packages/types/src/index.ts',
      ),
    },
  },
  server: {
    port: 5174,
  },
});

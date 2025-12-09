import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: [
        'zod',
        'zod-to-json-schema',
      ],
    },
  },
  resolve: {
    alias: {
      '@janhq/mcp-shared': resolve(__dirname, '../mcp-shared/src/index.ts'),
    },
  },
});

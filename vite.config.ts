import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: resolve(__dirname, 'src/popup'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'build/popup'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/popup/index.html'),
    },
  },
  resolve: {
    alias: {
      '@popup': resolve(__dirname, 'src/popup'),
    },
  },
});

import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default {
  base: '',
  plugins: [react()],
  build: {
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    // Avoid brittle identifier minification that can cause
    // TDZ errors like "Cannot access 'O' before initialization"
    // in some bundling edge cases.
    // Fully disable minification to avoid identifier
    // renaming issues causing TDZ errors in production.
    // This is safe for an extension and keeps source maps.
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      },
      input: {
        sidepanel: resolve(__dirname, 'ui/sidepanel/index.html'),
        options: resolve(__dirname, 'ui/options/index.html'),
      },
    },
  },
};

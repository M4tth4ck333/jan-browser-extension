import { resolve } from 'path';
import { copyFileSync, cpSync } from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Plugin to copy extension files after build
function copyExtensionFiles() {
  return {
    name: 'copy-extension-files',
    closeBundle() {
      // Copy manifest
      copyFileSync('manifest.json', 'dist/manifest.json');
      // Copy icons and src directories
      cpSync('icons', 'dist/icons', { recursive: true });
      cpSync('src', 'dist/src', { recursive: true });
    }
  };
}

export default {
  base: '',
  plugins: [react(), tailwindcss(), copyExtensionFiles()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'ui'),
    },
  },
  // Minimal test config with a single setup file
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'] },
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

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
    target: 'node18',
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: [
        // Node.js built-ins
        /^node:/,
        'fs',
        'path',
        'url',
        'crypto',
        'http',
        'https',
        'stream',
        'buffer',
        'events',
        'util',
        'net',
        'tls',
        // External npm dependencies
        '@modelcontextprotocol/sdk',
        /^@modelcontextprotocol\/sdk\//,
        'ws',
        'uuid',
        'zod',
        'zod-to-json-schema',
      ],
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
  },
  resolve: {
    alias: {
      '@janhq/mcp-shared': resolve(__dirname, '../mcp-shared/src/index.ts'),
    },
  },
});

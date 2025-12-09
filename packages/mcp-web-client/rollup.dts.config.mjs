import { dts } from 'rollup-plugin-dts';
import alias from '@rollup/plugin-alias';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.d.ts',
    format: 'es',
  },
  plugins: [
    alias({
      entries: [
        {
          find: '@janhq/mcp-shared',
          replacement: resolve(__dirname, '../mcp-shared/src/index.ts'),
        },
      ],
    }),
    dts({
      respectExternal: true,
      compilerOptions: {
        paths: {
          '@janhq/mcp-shared': ['../mcp-shared/src/index.ts'],
        },
        baseUrl: __dirname,
      },
    }),
  ],
  external: ['zod', 'zod-to-json-schema'],
};

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      [
        'shared',
        'document-import',
        'einvoice',
        'storage',
        'db',
        'invoice-core',
        'auth',
        'audit',
        'application',
        'observability',
      ].map((p) => [`@flux/${p}`, resolve(`packages/${p}/src/index.ts`)]),
    ),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});

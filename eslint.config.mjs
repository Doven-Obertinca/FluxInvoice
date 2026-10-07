import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([
  ...next,
  ...ts,
  {
    files: ['packages/invoice-core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'next',
            'next/*',
            'react',
            'react/*',
            '@flux/db',
            '@flux/application',
            '@flux/auth',
          ],
        },
      ],
    },
  },
  { settings: { next: { rootDir: 'apps/web' } } },
  globalIgnores([
    '**/.next/**',
    '**/next-env.d.ts',
    '**/migrations/**',
    '.local/**',
    'playwright-report/**',
    'test-results/**',
    'apps/web/public/reader/**',
  ]),
]);

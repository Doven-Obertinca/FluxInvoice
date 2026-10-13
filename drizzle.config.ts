import 'dotenv/config';
import { databaseUrl } from './packages/shared/src/production';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dbCredentials: {
    url: databaseUrl(),
  },
});

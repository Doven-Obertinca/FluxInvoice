import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://flux:flux@localhost:5432/fluxinvoice',
  },
});

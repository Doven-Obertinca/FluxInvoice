import { setTimeout } from 'node:timers/promises';
import type { Pool } from 'pg';

// pg-pool can resolve end() before PostgreSQL acknowledges every disconnect.
// Never FORCE-drop here: that can emit an uncaught error on a closing client.
export async function dropTestDatabase(admin: Pool, name: string) {
  if (!/^flux_(test|einvoice|incoming|upgrade|e2e)_[a-f0-9]+$/.test(name))
    throw new Error('Refusing to drop a non-test database');
  for (let attempt = 0; ; attempt++) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== '55006' ||
        attempt >= 49
      )
        throw error;
      await setTimeout(100);
    }
  }
}

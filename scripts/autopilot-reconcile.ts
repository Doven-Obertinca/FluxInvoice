import 'dotenv/config';
import { databaseUrl } from '@flux/shared';
import { connect, autopilotCursors } from '@flux/db';
import { eq } from 'drizzle-orm';
import { AutopilotService } from '../packages/application/src/autopilot';
const { db, pool } = connect(databaseUrl());
try {
  const service = new AutopilotService(db);
  const all = process.argv.includes('--all');
  for (let batch = 1; batch <= 10000; batch++) {
    await service.pulse();
    const [cursor] = await db
      .select()
      .from(autopilotCursors)
      .where(eq(autopilotCursors.key, 'reconcile'));
    if (!all || cursor?.organizationId === null) {
      process.stdout.write(
        `Autopilot: ${batch} bounded reconciliation batch(es) completed.\n`,
      );
      break;
    }
    if (batch === 10000)
      throw new Error(
        'BACKFILL_LIMIT_REACHED; resume the saved cursor in another run',
      );
  }
} finally {
  await pool.end();
}

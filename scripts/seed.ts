import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { connect, user } from '@flux/db';
import { InvoiceService } from '@flux/application';
import { environment } from '@flux/shared';
const env = environment();
if (env.APP_ENV !== 'development') throw new Error('Seed is development-only');
const email = process.env.SEED_USER_EMAIL;
if (!email)
  throw new Error('Set SEED_USER_EMAIL to an existing verified account');
const { db, pool } = connect(env.DATABASE_URL);
try {
  const [actor] = await db.select().from(user).where(eq(user.email, email));
  if (!actor)
    throw new Error('Create an account through the application first');
  const service = new InvoiceService(db);
  const organizationId = await service.createOrganization(
    actor.id,
    {
      name: 'Nordlicht Studio GmbH (fiktiv)',
      email: 'studio@example.test',
      vatId: 'DE123456789',
      address: {
        line1: 'Musterstraße 12',
        postalCode: '20457',
        city: 'Hamburg',
        country: 'DE',
      },
      taxNumber: '',
      contactName: 'Rechnungsservice',
      contactPhone: '+49 40 123456',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      numberPrefix: 'NL-',
    },
    randomUUID(),
  );
  const p = { userId: actor.id, organizationId, requestId: randomUUID() };
  await service.createCustomer(p, {
    name: 'Kontur Werkstatt GmbH (fiktiv)',
    email: 'buchhaltung@example.test',
    vatId: '',
    address: {
      line1: 'Beispielweg 7',
      postalCode: '10115',
      city: 'Berlin',
      country: 'DE',
    },
  });
} finally {
  await pool.end();
}

import Link from 'next/link';
import { BillingService } from '../../../packages/application/src/billing';
import { db } from '../lib/server';
import type { Principal } from '@flux/auth';
import { PLANS, planPrice } from '@flux/shared';
export async function Usage({ principal }: { principal: Principal }) {
  const usage = await new BillingService(db).usage(principal);
  const full = usage.used + usage.reserved >= usage.limit;
  return (
    <section className="usage-banner" aria-label="Monatliche Rechnungsnutzung">
      <div>
        <strong>
          {usage.used} von {usage.limit}{' '}
          {usage.plan === 'FREE' ? 'kostenlosen ' : ''}Rechnungen diesen Monat
          verwendet
        </strong>
        {usage.reserved > 0 && (
          <p>{usage.reserved} Plätze für laufende Ausstellungen reserviert.</p>
        )}
        {usage.plan === 'FREE' && usage.used >= usage.limit - 1 && (
          <p>
            Starter mit bis zu {PLANS.STARTER.monthlyInvoiceLimit} Rechnungen
            für {planPrice('STARTER')} monatlich ist geplant. Monatlich kündbar
            ab Freischaltung.
          </p>
        )}
        {full && (
          <p>
            Entwürfe und Downloads bleiben verfügbar. Neue Plätze gibt es im
            nächsten Kalendermonat.
          </p>
        )}
      </div>
      <Link className="button button-outline" href="/billing">
        Tarife vergleichen
      </Link>
    </section>
  );
}

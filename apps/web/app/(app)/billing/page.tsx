import { billingCheckouts } from '@flux/db';
import { eq } from 'drizzle-orm';
import { PLANS, planPrice } from '@flux/shared';
import { principal, db } from '../../../lib/server';
import { selectedPlan } from '../../../lib/plan-choice';
import { Usage } from '../../../components/usage';
import { Heading } from '../../../components/page';
import { PlanCards } from '../../../components/plan-cards';
import { CheckoutControls } from '../../../components/checkout-controls';
import { BillingService } from '../../../../../packages/application/src/billing';
import { paymentConfig } from '../../../../../packages/application/src/subscription-payments';
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const p = await principal();
  const current = await new BillingService(db).usage(p);
  const [binding] = await db
    .select({ subscriptionId: billingCheckouts.subscriptionId })
    .from(billingCheckouts)
    .where(eq(billingCheckouts.organizationId, p.organizationId));
  const chosen = (await selectedPlan()) ?? current.plan;
  const config = paymentConfig();
  const query = await searchParams;
  return (
    <>
      <Heading
        eyebrow="TARIF & NUTZUNG"
        title="Der passende Tarif für Ihre Arbeit."
        description="Wählen Sie Ihr Rechnungsvolumen. Die wichtigsten Werkzeuge sind in jedem Tarif dabei."
      />
      <Usage principal={p} />
      {query.checkout === 'returned' && (
        <p className="notice">
          Danke! Die Zahlungsbestätigung wird geprüft. Ihr Tarif wird nach
          bestätigter Zahlung aktualisiert. Laden Sie die Seite gegebenenfalls
          erneut.
        </p>
      )}
      {query.checkout === 'cancelled' && (
        <p className="notice">
          Der Zahlungsvorgang wurde abgebrochen. Ihr bisheriger Tarif bleibt
          bestehen.
        </p>
      )}
      <section className="checkout-summary" aria-label="Ihre Tarifauswahl">
        <p className="eyebrow">IHRE AUSWAHL</p>
        <h2>
          {PLANS[chosen].name} · {planPrice(chosen)} / Monat
        </h2>
        <p>
          Bis zu {PLANS[chosen].monthlyInvoiceLimit} Rechnungen pro Monat.{' '}
          {chosen !== 'FREE' && 'Monatlich kündbar.'}
        </p>
        <CheckoutControls
          plan={chosen}
          ready={!!config}
          paypal={config?.paypal ?? false}
          existing={!!binding?.subscriptionId}
        />
      </section>
      <PlanCards current={current.plan} selected={chosen} />
    </>
  );
}

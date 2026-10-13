'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { CreditCard, LockKeyhole } from 'lucide-react';
import { beginPayment } from '../lib/payment-actions';
import type { PlanId } from '@flux/shared';
export function CheckoutControls({
  plan,
  ready,
  paypal,
  existing,
}: {
  plan: PlanId;
  ready: boolean;
  paypal: boolean;
  existing: boolean;
}) {
  const [state, action, pending] = useActionState(beginPayment, {
    message: '',
  });
  return (
    <div>
      {plan === 'FREE' && existing && (
        <p>
          Den Wechsel zu Free bestätigen Sie in der Abo-Verwaltung. Ihr
          bezahlter Tarif bleibt bis zum Ende des laufenden Zeitraums verfügbar.
        </p>
      )}
      {plan === 'FREE' && !existing ? (
        <Link className="button button-primary" href="/dashboard">
          Weiter mit Free
        </Link>
      ) : (
        <form action={action}>
          <input type="hidden" name="plan" value={plan} />
          <input
            type="hidden"
            name="operation"
            value={existing ? 'portal' : 'checkout'}
          />
          <button
            className="button button-primary"
            disabled={!ready || pending}
          >
            <CreditCard size={17} />
            {pending
              ? 'Wird geöffnet …'
              : existing
                ? 'Abo verwalten & Tarif wechseln'
                : 'Zur sicheren Zahlung'}
          </button>
        </form>
      )}
      {plan !== 'FREE' && (
        <p className="muted">
          <LockKeyhole size={14} aria-hidden="true" />{' '}
          {ready
            ? `Karte${paypal ? ' oder PayPal' : ''} · Zahlungsdaten beim Zahlungsanbieter`
            : 'Zahlungsanbieter noch nicht verbunden. Sie können diesen Tarif bereits auswählen; eine Abbuchung erfolgt erst nach Freischaltung und Ihrer Bestätigung.'}
        </p>
      )}
      {state.message && <p role="alert">{state.message}</p>}
    </div>
  );
}

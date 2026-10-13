import { Check, ArrowRight, Sparkles } from 'lucide-react';
import {
  PLANS,
  PLAN_INCLUDED_FEATURES,
  planPrice,
  type PlanId,
} from '@flux/shared';
import { choosePlan } from '../lib/plan-actions';
const descriptions: Record<PlanId, string> = {
  FREE: 'Für Ihre ersten E-Rechnungen.',
  STARTER: 'Für regelmäßige Aufträge.',
  BUSINESS: 'Für einen vollen Arbeitsalltag.',
  PRO: 'Für ein hohes Rechnungsvolumen.',
};
export function PlanCards({
  current,
  selected,
}: {
  current?: PlanId;
  selected?: PlanId | null;
}) {
  return (
    <div className="pricing-grid pricing-grid-modern">
      {(Object.keys(PLANS) as PlanId[]).map((id) => (
        <article
          key={id}
          className={`pricing-card pricing-card-modern ${id === 'STARTER' ? 'pricing-featured' : ''} ${selected === id ? 'pricing-selected' : ''}`}
        >
          <div className="pricing-badge-slot">
            {id === 'STARTER' ? (
              <span className="pricing-badge">
                <Sparkles size={13} />
                Für regelmäßige Rechnungen
              </span>
            ) : current === id ? (
              <span className="pricing-badge pricing-badge-neutral">
                Ihr aktueller Tarif
              </span>
            ) : selected === id ? (
              <span className="pricing-badge pricing-badge-neutral">
                Ihre Auswahl
              </span>
            ) : null}
          </div>
          <h2>{PLANS[id].name}</h2>
          <p className="plan-description">{descriptions[id]}</p>
          <p className="price">
            {planPrice(id)}
            <span> / Monat</span>
          </p>
          <p className="plan-quota">
            <strong>{PLANS[id].monthlyInvoiceLimit}</strong> Rechnungen pro
            Monat
          </p>
          <ul className="plan-features">
            {PLAN_INCLUDED_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={16} aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className="plan-card-bottom">
            <form action={choosePlan.bind(null, id)}>
              <button
                className={`button ${id === 'STARTER' ? 'button-primary' : 'button-outline'}`}
                type="submit"
              >
                {current === id
                  ? 'Tarif ansehen'
                  : id === 'FREE'
                    ? 'Kostenlos starten'
                    : `${PLANS[id].name} wählen`}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </form>
            <p>
              {id === 'FREE'
                ? 'Keine Kreditkarte erforderlich'
                : 'Monatlich kündbar'}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

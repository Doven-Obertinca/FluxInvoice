export const PLANS = {
  FREE: { name: 'Free', monthlyPriceCents: 0, monthlyInvoiceLimit: 3 },
  STARTER: { name: 'Starter', monthlyPriceCents: 399, monthlyInvoiceLimit: 25 },
  BUSINESS: {
    name: 'Business',
    monthlyPriceCents: 799,
    monthlyInvoiceLimit: 100,
  },
  PRO: { name: 'Pro', monthlyPriceCents: 1499, monthlyInvoiceLimit: 500 },
} as const;
export type PlanId = keyof typeof PLANS;
export const PLAN_INCLUDED_FEATURES = [
  'XRechnung erstellen und prüfen',
  'PDFs und Fotos einlesen',
  'QR-Codes scannen und Angaben übernehmen',
  'E-Mail-Versand mit vorbereitetem Text und Anhang',
  'Autopilot: Rechnungen, Fristen und nächste Schritte im Blick',
  'Kunden verwalten',
  'Originaldateien herunterladen',
  'Entwürfe ohne Quotenverbrauch',
] as const;
export function planPrice(id: PlanId) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(PLANS[id].monthlyPriceCents / 100);
}

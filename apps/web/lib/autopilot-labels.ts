export const activityLabels: Record<string, string> = {
  detected: 'Hinweis erkannt',
  resolved: 'Hinweis erledigt',
  superseded: 'Hinweis durch neue Quelldaten ersetzt',
  acknowledge: 'Zur Kenntnis genommen',
  dismiss: 'Verworfen',
  snooze: 'Auf morgen verschoben',
  prepare: 'Checkliste auf Wunsch vorbereitet',
  checklist_prepared: 'Checkliste automatisch vorbereitet',
  policy_changed: 'Arbeitsweise geändert',
  payment_confirmed: 'Zahlung bestätigt',
  terms_confirmed: 'Zahlungsbedingungen bestätigt',
  duplicate_review_confirmed: 'Rechnungsvergleich bestätigt',
  helpful: 'Als hilfreich bewertet',
  irrelevant: 'Als nicht relevant bewertet',
  hide: 'Persönlich ausgeblendet',
};

export const statusLabels: Record<string, string> = {
  OPEN: 'Offen',
  ACKNOWLEDGED: 'Zur Kenntnis genommen',
  IN_PROGRESS: 'In Arbeit',
  RESOLVED: 'Erledigt',
  DISMISSED: 'Verworfen',
  SUPERSEDED: 'Durch neue Daten ersetzt',
};
export const severityLabels: Record<string, string> = {
  INFO: 'Information',
  ATTENTION: 'Im Blick behalten',
  WARNING: 'Prüfen',
  CRITICAL: 'Dringend',
};

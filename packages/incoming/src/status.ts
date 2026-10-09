export const incomingStatus: Record<string, string> = {
  RECEIVED: 'In Prüfung',
  REVIEW: 'Zur Durchsicht',
  ERROR: 'Verarbeitung unterbrochen',
  APPROVED: 'Freigegeben',
};
export const validationStatus: Record<string, string> = {
  PENDING: 'Prüfung ausstehend',
  VALID: 'XML-Prüfung bestanden',
  INVALID: 'Korrektur erforderlich',
  UNSUPPORTED: 'Profil nicht geprüft',
  ERROR: 'Prüfung nicht abgeschlossen',
};

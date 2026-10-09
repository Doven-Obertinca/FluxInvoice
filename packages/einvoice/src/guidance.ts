/** Product guidance is advisory metadata, never a replacement for profile rules. */
export function correctionGuidance(field: string) {
  if (field === 'buyerReference')
    return {
      why: 'Der Empfänger benötigt eine Zuordnung der Rechnung. Für dieses XRechnungsprofil ist die Kundenreferenz erforderlich.',
      action:
        'Erfragen Sie die Referenz beim Empfänger. Tragen Sie eine Leitweg-ID nur ein, wenn der Empfänger sie vorgibt.',
    };
  if (field.startsWith('seller.'))
    return {
      why: 'Diese Angabe stammt aus Ihren Unternehmensdaten und wird beim Speichern in den Rechnungsstand übernommen.',
      action:
        'Korrigieren Sie die Unternehmensdaten. Öffnen und speichern Sie danach diesen Entwurf erneut, bevor Sie ihn prüfen.',
    };
  if (field.startsWith('buyer.'))
    return {
      why: 'Die Empfängerangaben gehören zum gespeicherten Rechnungsstand.',
      action:
        'Prüfen Sie die Angaben mit dem Kunden. Speichern Sie anschließend diesen Entwurf erneut und starten Sie die Prüfung.',
    };
  return {
    why: 'Der gespeicherte Stand erfüllt diese Prüfregel noch nicht. Eine technische Prüfung bestätigt keine steuerliche Behandlung oder Zahlung.',
    action:
      'Prüfen Sie die betroffene Angabe anhand Ihrer Unterlagen, speichern Sie den Entwurf und prüfen Sie erneut. Bei unklarer Regel helfen die Prüfdetails dem Support.',
  };
}
export function finalizationBlocker(p: {
  finalized: boolean;
  dirty: boolean;
  active: boolean;
  canFinalize: boolean;
  pending: boolean;
  ready: boolean;
  failed: boolean;
}) {
  if (p.finalized) return null;
  if (!p.canFinalize)
    return 'Für die Finalisierung benötigen Sie die Rolle Inhaber, Administrator oder Buchhaltung.';
  if (p.dirty)
    return 'Speichern Sie zuerst Ihre Änderungen. Danach muss der neue Stand geprüft werden.';
  if (p.active)
    return 'Die Verarbeitung läuft. Warten Sie auf das Ergebnis, bevor Sie erneut finalisieren.';
  if (p.pending)
    return 'Die Daten bleiben gesperrt. Prüfen Sie den Verarbeitungsfehler, bevor Sie die Finalisierung mit derselben reservierten Nummer erneut versuchen.';
  if (!p.ready)
    return p.failed
      ? 'Korrigieren Sie die unten genannten Angaben und prüfen Sie den gespeicherten Entwurf erneut.'
      : 'Der gespeicherte Entwurf benötigt zuerst eine bestandene E-Rechnungsprüfung.';
  return null;
}

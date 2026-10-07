import Link from 'next/link';
import { displayMoney, calculate, normalizeDecimal } from '@flux/invoice-core';
import { toInput, type InvoiceDetail } from '@flux/application';
export function IssuedInvoice({
  detail,
  document,
}: {
  detail: InvoiceDetail;
  document:
    | {
        sha256: string;
        archiveMode: string;
        profileVersion: string;
        rulesetVersion: string;
        retainUntil: Date;
      }
    | undefined;
}) {
  const seller = detail.parties.find((p) => p.kind === 'SELLER')!;
  const buyer = detail.parties.find((p) => p.kind === 'BUYER')!;
  const i = detail.invoice;
  const totals = calculate(toInput(detail));
  return (
    <>
      <Link className="back-link" href="/invoices">
        ← Rechnungen
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">AUSGESTELLTE RECHNUNG</p>
          <h1>{i.number}</h1>
          <p className="muted">
            {buyer.name} · Ausgestellt am{' '}
            {i.issueDate.split('-').reverse().join('.')}
          </p>
        </div>
        <span className="badge green">Finalisiert</span>
      </div>
      <div className="issued-layout">
        <section className="panel issued-content" aria-label="Rechnungsinhalt">
          <div className="issued-parties">
            <div>
              <p className="eyebrow">RECHNUNGSSTELLER</p>
              <h2>{seller.name}</h2>
              <p>
                {seller.line1}
                <br />
                {seller.postalCode} {seller.city}
              </p>
              <p className="muted">{seller.vatId || seller.taxNumber}</p>
            </div>
            <div>
              <p className="eyebrow">EMPFÄNGER</p>
              <h2>{buyer.name}</h2>
              <p>
                {buyer.line1}
                <br />
                {buyer.postalCode} {buyer.city}
              </p>
              <p className="muted">{buyer.email}</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Leistung</th>
                  <th className="numeric">Menge</th>
                  <th className="numeric">Preis netto</th>
                  <th className="numeric">USt.</th>
                  <th className="numeric">Netto</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.description}</strong>
                      {l.allowance !== '0.00' && (
                        <small>Nachlass: {displayMoney(l.allowance)}</small>
                      )}
                      {l.charge !== '0.00' && (
                        <small>Zuschlag: {displayMoney(l.charge)}</small>
                      )}
                    </td>
                    <td className="numeric">
                      {normalizeDecimal(l.quantity).replace('.', ',')}{' '}
                      {l.unit === 'HUR'
                        ? 'Std.'
                        : l.unit === 'DAY'
                          ? 'Tage'
                          : 'Stk.'}
                    </td>
                    <td className="numeric">{displayMoney(l.unitPrice)}</td>
                    <td className="numeric">{l.vatRate} %</td>
                    <td className="numeric">{displayMoney(l.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="totals issued-totals">
            {detail.adjustments.map((a) => (
              <div key={a.id}>
                <dt>
                  {a.kind === 'ALLOWANCE' ? 'Nachlass' : 'Zuschlag'} ·{' '}
                  {a.reason}
                </dt>
                <dd>{displayMoney(a.amount)}</dd>
              </div>
            ))}
            <div>
              <dt>Nettobetrag</dt>
              <dd>{displayMoney(i.net)}</dd>
            </div>
            {totals.taxes.map((t) => (
              <div key={t.rate}>
                <dt>Umsatzsteuer {t.rate} %</dt>
                <dd>{displayMoney(t.tax)}</dd>
              </div>
            ))}
            <div className="grand-total">
              <dt>Gesamtbetrag</dt>
              <dd>{displayMoney(i.payable)}</dd>
            </div>
          </dl>
          {i.notes && <p className="paper-notes">{i.notes}</p>}
          <p className="issued-footnote">
            Lesbare Ansicht der eingefrorenen Rechnungsdaten. Das archivierte
            XML ist die maßgebliche E-Rechnung.
          </p>
        </section>
        <aside className="issued-aside">
          <section className="panel">
            <h2>Rechnungsdetails</h2>
            <dl className="detail-facts">
              <dt>Fällig am</dt>
              <dd>{i.dueDate.split('-').reverse().join('.')}</dd>
              <dt>Leistungsdatum</dt>
              <dd>{i.serviceDate.split('-').reverse().join('.')}</dd>
              <dt>Kundenreferenz</dt>
              <dd>{i.buyerReference}</dd>
              <dt>Zahlungsart</dt>
              <dd>Überweisung</dd>
              <dt>IBAN</dt>
              <dd>{seller.iban}</dd>
              <dt>Kontakt</dt>
              <dd>
                {seller.contactName}
                <br />
                {seller.email}
                <br />
                {seller.contactPhone}
              </dd>
            </dl>
          </section>
          <section className="panel">
            <h2>Archiv & Integrität</h2>
            <p className="muted">
              Die Originaldatei wird bei jedem Download anhand ihres SHA-256
              geprüft.
            </p>
            <details>
              <summary>Technische Nachweise</summary>
              <dl className="detail-facts">
                <dt>Profil</dt>
                <dd>XRechnung {document?.profileVersion} · UBL 2.1</dd>
                <dt>Regelwerk</dt>
                <dd>{document?.rulesetVersion}</dd>
                <dt>Archiv</dt>
                <dd>
                  {document?.archiveMode === 'LOCAL'
                    ? 'Lokales Entwicklungsarchiv'
                    : 'S3 Object Lock · Compliance'}
                </dd>
                <dt>Aufbewahrung bis</dt>
                <dd>{document?.retainUntil.toLocaleDateString('de-DE')}</dd>
                <dt>SHA-256</dt>
                <dd>
                  <code>{document?.sha256}</code>
                </dd>
              </dl>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}

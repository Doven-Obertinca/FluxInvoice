'use client';
import {
  createContext,
  useContext,
  useState,
  useTransition,
  useRef,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import {
  onboard,
  saveCompany,
  saveCustomer,
  type Result,
} from '../lib/actions';
const Errors = createContext<Record<string, string>>({});
export function Field({
  label,
  name,
  defaultValue = '',
  required = true,
  type = 'text',
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  hint?: string;
}) {
  const errors = useContext(Errors);
  const error = errors[name] ?? errors[`address.${name}`];
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        name={name}
        id={name}
        defaultValue={defaultValue}
        required={required}
        type={type}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${name}-error` : hint ? `${name}-hint` : undefined
        }
      />
      {hint && <small id={`${name}-hint`}>{hint}</small>}
      {error && (
        <small className="field-error" id={`${name}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}
export function BusinessForm({
  kind,
  initial = {},
  id,
}: {
  kind: 'onboarding' | 'company' | 'customer';
  initial?: Record<string, string>;
  id?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result<unknown> | null>(null);
  const [step, setStep] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const company = kind !== 'customer';
  const onboarding = kind === 'onboarding';
  const next = () => {
    const section = form.current?.querySelector(`[data-step="${step}"]`);
    for (const input of section?.querySelectorAll('input,select') ?? []) {
      if (
        input instanceof HTMLInputElement ||
        input instanceof HTMLSelectElement
      ) {
        if (!input.reportValidity()) return;
      }
    }
    setStep(step + 1);
  };
  const field = (
    name: string,
    label: string,
    required = true,
    hint?: string,
  ) => (
    <Field
      name={name}
      label={label}
      defaultValue={initial[name] ?? ''}
      required={required}
      {...(hint ? { hint } : {})}
    />
  );
  return (
    <Errors.Provider value={result && !result.ok ? result.fields : {}}>
      {onboarding && (
        <div className="onboarding-progress" aria-label="Einrichtungsschritte">
          {['1 · Unternehmen', '2 · Rechnungsangaben', '3 · Zahlung'].map(
            (label, i) => (
              <span
                key={label}
                className={i === step ? 'active' : ''}
                aria-current={i === step ? 'step' : undefined}
              >
                {label}
              </span>
            ),
          )}
        </div>
      )}
      <form
        ref={form}
        className="panel business-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (onboarding && step < 2) {
            next();
            return;
          }
          const data = new FormData(e.currentTarget);
          const get = (key: string) => String(data.get(key) ?? '');
          const input = {
            name: get('name'),
            email: get('email'),
            vatId: get('vatId'),
            address: {
              line1: get('line1'),
              city: get('city'),
              postalCode: get('postalCode'),
              country: 'DE',
            },
            ...(company
              ? {
                  taxNumber: get('taxNumber'),
                  contactName: get('contactName'),
                  contactPhone: get('contactPhone'),
                  iban: get('iban').replace(/\s/g, ''),
                  bic: get('bic'),
                  numberPrefix: get('numberPrefix'),
                }
              : {}),
          };
          start(async () => {
            const r =
              kind === 'onboarding'
                ? await onboard(input)
                : kind === 'company'
                  ? await saveCompany(input)
                  : await saveCustomer(input, id);
            setResult(r);
            if (r.ok) {
              router.push(
                kind === 'onboarding'
                  ? '/dashboard'
                  : kind === 'customer'
                    ? `/customers/${r.value}`
                    : '/settings/company',
              );
              router.refresh();
            } else {
              const path = Object.keys(r.fields)[0]?.replace('address.', '');
              if (path) {
                const target = document.getElementById(path);
                const stepNumber = target
                  ?.closest('[data-step]')
                  ?.getAttribute('data-step');
                if (onboarding && stepNumber) setStep(Number(stepNumber));
                requestAnimationFrame(() => target?.focus());
              }
            }
          });
        }}
      >
        <section data-step="0" hidden={onboarding && step !== 0}>
          <div className="section-heading">
            <div>
              <h2>{company ? 'Unternehmen & Anschrift' : 'Kundendaten'}</h2>
              <p className="muted">
                Diese Angaben werden auf Ihren Rechnungen verwendet.
              </p>
            </div>
          </div>
          <div className="form-grid">
            {field('name', 'Firmenname')}
            <Field
              label="E-Mail"
              name="email"
              type="email"
              defaultValue={initial.email ?? ''}
              hint="Dient auch als elektronische Rechnungsadresse."
            />
            {field('line1', 'Straße und Hausnummer')}
            {field('postalCode', 'Postleitzahl')}
            {field('city', 'Ort')}
            <label className="field">
              Land
              <select name="country">
                <option value="DE">Deutschland</option>
              </select>
            </label>
            {!company && field('vatId', 'Umsatzsteuer-ID', false)}
          </div>
        </section>
        {company && (
          <>
            <section data-step="1" hidden={onboarding && step !== 1}>
              <div className="section-heading">
                <div>
                  <h2>Steuern & Rechnungskontakt</h2>
                  <p className="muted">
                    Für die E-Rechnung brauchen wir eine steuerliche Kennung und
                    einen erreichbaren Rechnungskontakt.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                {field(
                  'vatId',
                  'Umsatzsteuer-ID',
                  false,
                  'DE und neun Ziffern; alternativ eine Steuernummer angeben.',
                )}
                {field('taxNumber', 'Steuernummer', false)}
                {field(
                  'contactName',
                  'Kontaktperson',
                  true,
                  'Name oder zuständige Abteilung für Rechnungsfragen.',
                )}
                {field(
                  'contactPhone',
                  'Telefon',
                  true,
                  'Telefonnummer Ihres Rechnungskontakts.',
                )}
                {field(
                  'numberPrefix',
                  'Nummernpräfix (optional)',
                  false,
                  'Nur Großbuchstaben, Zahlen und Bindestriche. Beispiel: RE-',
                )}
                <div className="field">
                  Nummernvergabe
                  <p className="muted">
                    Präfix + Jahr + fortlaufende Nummer. Die Nummer wird bei der
                    Finalisierung fest vergeben.
                  </p>
                </div>
              </div>
            </section>
            <section data-step="2" hidden={onboarding && step !== 2}>
              <div className="section-heading">
                <div>
                  <h2>Zahlung per Überweisung</h2>
                  <p className="muted">
                    Ihre Bankverbindung wird beim Speichern in die Rechnung
                    übernommen.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                {field('iban', 'IBAN', true, 'Deutsche IBAN mit 22 Zeichen.')}
                {field(
                  'bic',
                  'BIC',
                  true,
                  'Bankkennung mit 8 oder 11 Zeichen.',
                )}
                <div className="field">
                  Rechnungswährung<p>EUR · Euro</p>
                </div>
              </div>
            </section>
          </>
        )}
        <div aria-live="polite">
          {result && !result.ok && (
            <div role="alert" className="notice error">
              <strong>{result.message}</strong>
              <p>Bitte prüfen Sie die markierten Felder.</p>
              <small>Referenz: {result.requestId}</small>
            </div>
          )}
          {result?.ok && <p className="notice">Gespeichert.</p>}
        </div>
        <div className="actions form-actions">
          {onboarding && step > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={pending}
            >
              Zurück
            </Button>
          )}
          {onboarding && step < 2 ? (
            <Button type="button" onClick={next}>
              Weiter
            </Button>
          ) : (
            <Button disabled={pending}>
              {pending
                ? 'Wird gespeichert …'
                : company
                  ? 'Unternehmen speichern'
                  : 'Kunde speichern'}
            </Button>
          )}
        </div>
      </form>
    </Errors.Provider>
  );
}

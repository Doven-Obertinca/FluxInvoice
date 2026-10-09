'use client';
import { useState, useTransition } from 'react';
import {
  defaults,
  variables,
  type MailSettings,
} from '../../../packages/application/src/email-template';
import { saveMailSettings } from '../lib/actions';
import { Button } from './ui/button';
export function EmailSettings({ initial }: { initial: MailSettings }) {
  const [value, setValue] = useState(initial),
    [message, setMessage] = useState(''),
    [busy, start] = useTransition();
  return (
    <form
      className="panel delivery-fields"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveMailSettings(value);
          setMessage(r.ok ? 'E-Mail-Einstellungen gespeichert.' : r.message);
        });
      }}
    >
      <h2>E-Mail & Versand</h2>
      <p className="muted">
        Ihre Firmenidentität und Standardtexte für den Rechnungsversand.
      </p>
      <label>
        Vorlagensprache
        <select
          value={value.language}
          onChange={(e) => {
            const language = e.target.value as 'de' | 'en';
            setValue({ ...value, language, ...defaults(language) });
          }}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </label>
      <p className="muted">
        Ein Sprachwechsel lädt den jeweiligen Standardtext und die
        Standardsignatur.
      </p>
      {(
        [
          ['senderName', 'Absendername'],
          ['replyTo', 'Antwortadresse'],
          ['contactEmail', 'Kontakt-E-Mail'],
          ['contactPhone', 'Telefon'],
          ['subject', 'Standardbetreff'],
          ['message', 'Standardnachricht'],
          ['signature', 'Signatur'],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          {key === 'message' || key === 'signature' ? (
            <textarea
              rows={key === 'message' ? 9 : 5}
              value={value[key]}
              onChange={(e) => setValue({ ...value, [key]: e.target.value })}
            />
          ) : (
            <input
              type={
                key === 'replyTo' || key === 'contactEmail' ? 'email' : 'text'
              }
              value={value[key]}
              onChange={(e) => setValue({ ...value, [key]: e.target.value })}
            />
          )}
        </label>
      ))}
      <details>
        <summary>Verfügbare Platzhalter</summary>
        {variables.map((v) => (
          <p key={v}>
            <code>{'{{' + v + '}}'}</code>
          </p>
        ))}
      </details>
      <p role="status">{message}</p>
      <Button disabled={busy} type="submit">
        Einstellungen speichern
      </Button>
    </form>
  );
}

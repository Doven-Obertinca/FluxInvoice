'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { composeDelivery, sendDelivery } from '../lib/actions';
import { Button } from './ui/button';
import type {
  Attempt,
  DeliveryService,
} from '../../../packages/application/src/delivery';
type Composer = Awaited<ReturnType<DeliveryService['compose']>>;
export function InvoiceDelivery({
  id,
  attempts,
  canSend,
}: {
  id: string;
  attempts: Attempt[];
  canSend: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState(false),
    [draft, setDraft] = useState<Composer | null>(null),
    [message, setMessage] = useState(''),
    [busy, start] = useTransition();
  const key = useRef('');
  const lock = useRef(false);
  const queued = attempts.some((a) => a.status === 'QUEUED');
  const awaitingReceipt = attempts.some((a) => a.status === 'SUBMITTED');
  useEffect(() => {
    if (!queued && !awaitingReceipt) return;
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') router.refresh();
      },
      queued ? 2500 : 10000,
    );
    return () => clearInterval(timer);
  }, [queued, awaitingReceipt, router]);
  function compose() {
    start(async () => {
      const result = await composeDelivery(id);
      if (result.ok) {
        setDraft(result.value);
        key.current = crypto.randomUUID();
        setPreview(false);
        setMessage('');
        setOpen(true);
      } else setMessage(result.message);
    });
  }
  function send() {
    if (lock.current || !draft || !preview) return;
    lock.current = true;
    start(async () => {
      try {
        const result = await sendDelivery(id, {
          key: key.current,
          recipient: draft.recipient,
          subject: draft.subject,
          message: draft.message,
          ...(attempts[0] ? { resendOf: attempts[0].id } : {}),
        });
        if (result.ok) {
          setOpen(false);
          setMessage('Versand wurde in die Warteschlange aufgenommen.');
          router.refresh();
        } else setMessage(result.message);
      } catch {
        setMessage(
          'Verbindung unterbrochen. Bitte versuchen Sie denselben Auftrag erneut.',
        );
      } finally {
        lock.current = false;
      }
    });
  }
  const labels: Record<string, string> = {
    QUEUED: 'In Warteschlange',
    SUBMITTED: 'Übermittelt · Zustellung noch nicht bestätigt',
    DELIVERED: '✓ Zugestellt',
    BOUNCED: 'Zustellung fehlgeschlagen',
    FAILED: 'Versand fehlgeschlagen',
  };
  return (
    <section className="panel delivery-panel" aria-label="Versand">
      <div className="page-heading">
        <div>
          <p className="eyebrow">VERSAND</p>
          <h2>Rechnung per E-Mail senden</h2>
        </div>
        {canSend && (
          <Button disabled={busy || queued} onClick={compose}>
            {attempts.length ? 'Erneut senden' : 'Rechnung senden'}
          </Button>
        )}
      </div>
      {!attempts.length && (
        <p className="muted">
          Die finalisierte XRechnung wird automatisch als XML angehängt.
        </p>
      )}
      {attempts.map((a) => (
        <article className="delivery-attempt" key={a.id}>
          <time>{new Date(a.created_at).toLocaleString('de-DE')}</time>
          <p>{a.recipient}</p>
          <strong>{labels[a.status]}</strong>
          {a.error_code === 'SUBMISSION_UNKNOWN' && (
            <p className="muted">
              Der Versand konnte nicht bestätigt werden. Prüfen Sie den Empfang
              vor einem erneuten Versand.
            </p>
          )}
        </article>
      ))}
      {canSend &&
        attempts[0] &&
        ['FAILED', 'BOUNCED'].includes(attempts[0].status) && (
          <Button variant="outline" disabled={busy} onClick={compose}>
            Andere E-Mail-Adresse verwenden
          </Button>
        )}
      <p role="status">{!open && message}</p>
      <Dialog.Root
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog delivery-dialog">
            <Dialog.Title>
              {preview ? 'Versandvorschau' : 'Rechnung senden'}
            </Dialog.Title>
            <Dialog.Description>
              Prüfen Sie Empfänger und Nachricht. Änderungen gelten nur für
              diesen Versand.
            </Dialog.Description>
            {draft && (
              <>
                <p className="muted">
                  Absender: {draft.senderName} · Antworten an {draft.replyTo}
                </p>
                {preview ? (
                  <div className="email-preview">
                    <p>
                      <strong>An:</strong> {draft.recipient}
                    </p>
                    <p>
                      <strong>Betreff:</strong> {draft.subject}
                    </p>
                    <div className="email-message">{draft.message}</div>
                    <small>Versendet über ERechno</small>
                  </div>
                ) : (
                  <div className="delivery-fields">
                    <label>
                      Empfänger
                      <input
                        type="email"
                        value={draft.recipient}
                        onChange={(e) =>
                          setDraft({ ...draft, recipient: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Betreff
                      <input
                        maxLength={300}
                        value={draft.subject}
                        onChange={(e) =>
                          setDraft({ ...draft, subject: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Nachricht
                      <textarea
                        rows={12}
                        maxLength={16000}
                        value={draft.message}
                        onChange={(e) =>
                          setDraft({ ...draft, message: e.target.value })
                        }
                      />
                    </label>
                  </div>
                )}
                <p>
                  <strong>Anhang:</strong> {draft.attachment.filename} ·{' '}
                  {(draft.attachment.size / 1024).toFixed(1)} KB · Finalisierte
                  XRechnung
                </p>
                <p role="status">{message}</p>
                <div className="actions">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setPreview(!preview)}
                  >
                    {preview ? 'Bearbeiten' : 'Vorschau'}
                  </Button>
                  <Button disabled={busy || !preview} onClick={send}>
                    {busy ? 'Wird gesendet …' : 'Rechnung senden'}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

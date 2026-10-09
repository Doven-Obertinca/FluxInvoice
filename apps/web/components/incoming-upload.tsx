'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importIncoming } from '../lib/actions';
export function IncomingUpload() {
  const input = useRef<HTMLInputElement>(null),
    key = useRef(crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState(''),
    [busy, start] = useTransition();
  const router = useRouter();
  const choose = (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length !== 1) {
      setMessage('Bitte importieren Sie eine Datei pro Vorgang.');
      return;
    }
    const f = files[0]!;
    key.current = crypto.randomUUID();
    setFile(f);
    setMessage(f.size > 2097152 ? 'Die Datei überschreitet 2 MiB.' : '');
  };
  return (
    <section
      className="panel incoming-drop"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) choose(e.dataTransfer.files);
      }}
      aria-label="Eingangsrechnung importieren"
    >
      <h2>Original importieren</h2>
      <p className="muted">
        XML oder hybrides PDF hier ablegen oder auswählen · maximal 2 MiB. Das
        Original wird auf dem Server unverändert aufbewahrt. Keine automatische
        Freigabe oder Zahlung.
      </p>
      <label className="field">
        Eingangsdatei
        <input
          ref={input}
          type="file"
          accept=".xml,.pdf,application/xml,text/xml,application/pdf"
          disabled={busy}
          onChange={(e) => choose(e.target.files)}
        />
      </label>
      {file && <p>{file.name}</p>}
      <button
        className="button button-primary"
        disabled={busy || !file || file.size > 2097152 || !file.size}
        onClick={() =>
          start(async () => {
            if (!file) return;
            const data = new FormData();
            data.set('file', file);
            data.set('key', key.current);
            try {
              const r = await importIncoming(data);
              if (r.ok) router.push(`/incoming/${r.value}`);
              else setMessage(r.message);
            } catch {
              setMessage(
                'Import nicht abgeschlossen. Sie können denselben Auftrag erneut versuchen.',
              );
            }
          })
        }
      >
        {busy ? 'Original wird übernommen …' : 'Original importieren'}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}

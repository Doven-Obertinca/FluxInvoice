'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, Sun, Moon, X } from 'lucide-react';
import { searchWorkspace } from '../lib/actions';
const commands = [
  { label: 'Neue Rechnung erstellen', href: '/invoices/new' },
  { label: 'Aus Dokument erstellen', href: '/invoices/import' },
  { label: 'Eingangsrechnungen öffnen', href: '/incoming' },
  { label: 'Handlungsbedarf prüfen', href: '/invoices/attention' },
  { label: 'Rechnungen durchsuchen', href: '/invoices' },
  { label: 'Kunden suchen oder anlegen', href: '/customers' },
  { label: 'Unternehmensdaten bearbeiten', href: '/settings/company' },
  { label: 'Übersicht öffnen', href: '/dashboard' },
];
export function WorkspaceTools() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    query: string;
    items: { href: string; label: string; detail: string; kind: string }[];
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const response = await searchWorkspace(query);
        if (!stale)
          setResult({
            query,
            items: response.ok ? response.value : [],
            failed: !response.ok,
          });
      } catch {
        if (!stale) setResult({ query, items: [], failed: true });
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, open, retry]);
  const matches = result?.query === query ? result : null;
  const [dark, setDark] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const saved = localStorage.getItem('flux-theme');
    const value =
      saved === 'dark' ||
      (!saved && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = value ? 'dark' : 'light';
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuery('');
        setResult(null);
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const current = pathname.startsWith('/incoming')
    ? 'Eingangsrechnungen'
    : pathname.startsWith('/invoices')
      ? 'Rechnungen'
      : pathname.startsWith('/customers')
        ? 'Kunden'
        : pathname.startsWith('/settings')
          ? 'Einstellungen'
          : 'Übersicht';
  return (
    <>
      <span className="breadcrumb">
        Arbeitsbereich <span>/</span> <strong>{current}</strong>
      </span>
      <div className="actions">
        <button
          className="command-trigger"
          aria-label="Suchen & navigieren"
          onClick={() => {
            setQuery('');
            setResult(null);
            setOpen(true);
          }}
        >
          <Search size={15} />
          <span>Suchen & navigieren</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className="icon-button"
          aria-label="Farbschema wechseln"
          onClick={() => {
            const value = document.documentElement.dataset.theme !== 'dark';
            setDark(value);
            document.documentElement.dataset.theme = value ? 'dark' : 'light';
            localStorage.setItem('flux-theme', value ? 'dark' : 'light');
          }}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setQuery('');
            setResult(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog command-dialog">
            <div className="section-heading">
              <Dialog.Title>Suchen & navigieren</Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Schließen">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="muted">
              Rechnungen und Kunden nach Name, Nummer, Referenz, USt-ID oder
              Betrag suchen. Ab zwei Zeichen.
            </Dialog.Description>
            <input
              aria-label="Befehl suchen"
              maxLength={100}
              placeholder="Rechnung, Kunde, Referenz oder 119,00 …"
              value={query}
              onChange={(e) => {
                setResult(null);
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  list.current?.querySelector('button')?.focus();
                }
              }}
            />
            <div role="status" className="muted">
              {query.trim().length >= 2 &&
                (!matches
                  ? 'Suche läuft …'
                  : matches.failed
                    ? 'Suche nicht verfügbar. Bitte erneut versuchen.'
                    : `${matches.items.length} Treffer${matches.items.length === 16 ? ' · Suche bei Bedarf eingrenzen' : ''}`)}
            </div>
            {matches?.failed && (
              <button
                className="text-button"
                onClick={() => {
                  setResult(null);
                  setRetry((n) => n + 1);
                }}
              >
                Suche erneut versuchen
              </button>
            )}
            <div
              ref={list}
              className="command-results"
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                const buttons = Array.from(
                  list.current?.querySelectorAll('button') ?? [],
                );
                const index = buttons.indexOf(e.target as HTMLButtonElement);
                if (index < 0) return;
                e.preventDefault();
                buttons[
                  (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                    buttons.length
                ]?.focus();
              }}
            >
              {query.trim().length >= 2 &&
                matches?.items.map((c) => (
                  <button
                    key={c.href}
                    onClick={() => {
                      router.push(c.href);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <span>
                      <small>{c.kind}</small>
                      <strong>{c.label}</strong>
                      <small>{c.detail}</small>
                    </span>
                    <span>↵</span>
                  </button>
                ))}
              {commands
                .filter((c) =>
                  c.label
                    .toLocaleLowerCase('de')
                    .includes(query.toLocaleLowerCase('de')),
                )
                .map((c) => (
                  <button
                    key={c.href}
                    onClick={() => {
                      router.push(c.href);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    {c.label}
                    <span>↵</span>
                  </button>
                ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

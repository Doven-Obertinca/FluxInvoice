'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, Sun, Moon, X } from 'lucide-react';
const commands = [
  { label: 'Brief, PDF oder QR-Code lesen', href: '/invoices/import' },
  { label: 'Neue Rechnung erstellen', href: '/invoices/new' },
  { label: 'Rechnungen durchsuchen', href: '/invoices' },
  { label: 'Kunden suchen oder anlegen', href: '/customers' },
  { label: 'Unternehmensdaten bearbeiten', href: '/settings/company' },
  { label: 'Übersicht öffnen', href: '/dashboard' },
];
export function WorkspaceTools() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const current = pathname.startsWith('/invoices')
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
        <button className="command-trigger" onClick={() => setOpen(true)}>
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
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog command-dialog">
            <div className="section-heading">
              <Dialog.Title>Schnellnavigation</Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Schließen">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="muted">
              Ein Ziel suchen und mit der Tastatur öffnen.
            </Dialog.Description>
            <input
              aria-label="Befehl suchen"
              placeholder="Rechnung, Kunde, Einstellungen …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  list.current?.querySelector('button')?.focus();
                }
              }}
            />
            <div ref={list} className="command-results">
              {commands
                .filter((c) =>
                  c.label
                    .toLocaleLowerCase('de')
                    .includes(query.toLocaleLowerCase('de')),
                )
                .map((c) => (
                  <button
                    key={c.href}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        const next =
                          e.key === 'ArrowDown'
                            ? e.currentTarget.nextElementSibling
                            : e.currentTarget.previousElementSibling;
                        if (next instanceof HTMLButtonElement) next.focus();
                      }
                    }}
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

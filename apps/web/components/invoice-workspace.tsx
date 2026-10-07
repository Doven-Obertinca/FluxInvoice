'use client';
import { createContext, useContext, useState } from 'react';
const DirtyContext = createContext<{
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}>({ dirty: false, setDirty: () => {} });
export function InvoiceWorkspace({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return (
    <DirtyContext.Provider value={{ dirty, setDirty }}>
      {children}
    </DirtyContext.Provider>
  );
}
export const useInvoiceDirty = () => useContext(DirtyContext);

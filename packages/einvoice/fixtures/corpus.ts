import { fixture } from './supported';
import type { FrozenInvoice } from '../src';
export const validCases: Record<string, FrozenInvoice> = {
  standard19: fixture,
  reduced7: {
    ...fixture,
    input: {
      ...fixture.input,
      lines: fixture.input.lines.map((l) => ({ ...l, vatRate: '7' })),
    },
  },
  mixed: {
    ...fixture,
    input: {
      ...fixture.input,
      lines: [
        ...fixture.input.lines,
        {
          description: 'Fachbuch — Einführung',
          quantity: '3',
          unitPrice: '19.99',
          unit: 'C62',
          vatRate: '7',
          allowance: '0',
          charge: '0',
        },
      ],
    },
  },
  adjustments: {
    ...fixture,
    input: {
      ...fixture.input,
      lines: fixture.input.lines.map((l) => ({
        ...l,
        allowance: '12.50',
        charge: '2.50',
      })),
      adjustments: [
        {
          kind: 'ALLOWANCE',
          reason: 'Treuerabatt',
          amount: '5',
          vatRate: '19',
        },
        { kind: 'CHARGE', reason: 'Versand', amount: '3', vatRate: '19' },
      ],
    },
  },
};

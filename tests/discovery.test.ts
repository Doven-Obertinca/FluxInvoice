import { describe, expect, it } from 'vitest';
import { searchTerm } from '../packages/application/src/discovery';
import { correctionGuidance, finalizationBlocker } from '@flux/einvoice';
describe('discovery and correction boundaries', () => {
  it('escapes wildcard characters and recognizes exact decimal amounts without guessing grouping', () => {
    expect(searchTerm(' 100%_\\ ').pattern).toBe('%100\\%\\_\\\\%');
    expect(searchTerm('119,00').amount).toBe('119.00');
    expect(searchTerm('119.00').amount).toBe('119.00');
    for (const raw of ['1.000', '1.000,00', '1e3', '-1', 'Infinity', '119 EUR'])
      expect(searchTerm(raw).amount).toBeNull();
    expect(() => searchTerm('x'.repeat(101))).toThrow();
    expect(() => searchTerm({ organizationId: 'other' })).toThrow();
  });
  const ready = {
    finalized: false,
    dirty: false,
    active: false,
    canFinalize: true,
    pending: false,
    ready: true,
    failed: false,
  };
  it('explains each blocker without granting fiscal authority', () => {
    expect(finalizationBlocker(ready)).toBeNull();
    expect(finalizationBlocker({ ...ready, canFinalize: false })).toContain(
      'Rolle',
    );
    expect(finalizationBlocker({ ...ready, dirty: true })).toContain(
      'Speichern',
    );
    expect(finalizationBlocker({ ...ready, active: true })).toContain('läuft');
    expect(finalizationBlocker({ ...ready, pending: true })).toContain(
      'reservierten Nummer',
    );
    expect(finalizationBlocker({ ...ready, ready: false })).toContain(
      'bestandene',
    );
    expect(
      finalizationBlocker({ ...ready, ready: false, failed: true }),
    ).toContain('Korrigieren');
    expect(
      finalizationBlocker({ ...ready, finalized: true, canFinalize: false }),
    ).toBeNull();
  });
  it('does not invent references, tax remedies or silent snapshot updates', () => {
    expect(correctionGuidance('buyerReference').action).toContain('Erfragen');
    expect(correctionGuidance('seller.email').action).toContain('speichern');
    expect(correctionGuidance('buyer.email').action).toContain('erneut');
    expect(correctionGuidance('/unmapped-rule').action).toContain('Support');
    expect(correctionGuidance('/unmapped-rule').why).toContain(
      'keine steuerliche',
    );
  });
});

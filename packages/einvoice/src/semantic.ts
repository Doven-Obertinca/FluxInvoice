import { z } from 'zod';
import {
  calculate,
  invoiceInputSchema,
  type InvoiceInput,
  type Totals,
} from '@flux/invoice-core';
import manifest from '../compliance/manifest.json';
export { manifest };
export const profileId = manifest.id;
export interface Issue {
  ruleId: string;
  severity: 'ERROR' | 'WARNING';
  source:
    | 'INPUT'
    | 'DOMAIN'
    | 'SEMANTIC'
    | 'XRECHNUNG'
    | 'KOSIT'
    | 'INTEGRITY'
    | 'SYSTEM';
  fieldPath: string;
  businessTerm: string;
  message: string;
  profile: string;
  profileVersion: string;
  rulesetVersion: string;
  technicalLocation: string;
}
export const terms = {
  buyerReference: {
    field: 'buyerReference',
    bt: 'BT-10',
    xml: 'cbc:BuyerReference',
    message:
      'Bitte geben Sie die Kundenreferenz oder Leitweg-ID des Empfängers an.',
  },
  sellerName: {
    field: 'seller.name',
    bt: 'BT-27',
    xml: 'cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName',
    message: 'Der rechtliche Unternehmensname fehlt.',
  },
  sellerTax: {
    field: 'seller.vatId',
    bt: 'BT-31',
    xml: 'cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID',
    message: 'Hinterlegen Sie Ihre Umsatzsteuer-ID oder Steuernummer.',
  },
  sellerContact: {
    field: 'seller.contactName',
    bt: 'BT-41',
    xml: 'cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:Name',
    message: 'Hinterlegen Sie eine Kontaktperson für Rechnungsfragen.',
  },
  sellerPhone: {
    field: 'seller.contactPhone',
    bt: 'BT-42',
    xml: 'cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:Telephone',
    message: 'Hinterlegen Sie eine Telefonnummer für Rechnungsfragen.',
  },
  sellerEmail: {
    field: 'seller.email',
    bt: 'BT-43',
    xml: 'cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:ElectronicMail',
    message: 'Hinterlegen Sie eine gültige Kontakt-E-Mail-Adresse.',
  },
  buyerEmail: {
    field: 'buyer.email',
    bt: 'BT-49',
    xml: 'cac:AccountingCustomerParty/cac:Party/cbc:EndpointID',
    message: 'Hinterlegen Sie eine gültige E-Mail-Adresse des Empfängers.',
  },
  iban: {
    field: 'seller.iban',
    bt: 'BT-84',
    xml: 'cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID',
    message: 'Prüfen Sie die IBAN in Ihren Unternehmensdaten.',
  },
  totals: {
    field: 'lines',
    bt: 'BT-115',
    xml: 'cac:LegalMonetaryTotal/cbc:PayableAmount',
    message:
      'Die Rechnungsbeträge sind nicht konsistent. Prüfen und speichern Sie die Positionen erneut.',
  },
} as const;
export function issue(
  ruleId: string,
  fieldPath: string,
  message: string,
  source: Issue['source'] = 'SEMANTIC',
  businessTerm = '',
  technicalLocation = '',
): Issue {
  return {
    ruleId,
    severity: 'ERROR',
    source,
    fieldPath,
    businessTerm,
    message,
    profile: manifest.profile,
    profileVersion: manifest.specificationVersion,
    rulesetVersion: manifest.technicalBundleVersion,
    technicalLocation,
  };
}
export const partySchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.email(),
    line1: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().regex(/^\d{5}$/),
    country: z.literal('DE'),
    vatId: z
      .string()
      .regex(/^DE\d{9}$/)
      .or(z.literal('')),
    taxNumber: z.string(),
    contactName: z.string(),
    contactPhone: z.string(),
    iban: z.string(),
    bic: z.string(),
  })
  .strict();
export type Party = z.infer<typeof partySchema>;
export interface FrozenInvoice {
  input: InvoiceInput;
  seller: Party;
  buyer: Party;
  revision: number;
}
export interface SemanticInvoice {
  id: string;
  typeCode: '380';
  issueDate: string;
  dueDate: string;
  serviceDate: string;
  currency: 'EUR';
  buyerReference: string;
  notes: string;
  seller: Party & { electronicAddress: { scheme: 'EM'; value: string } };
  buyer: Party & { electronicAddress: { scheme: 'EM'; value: string } };
  payment: { means: '58'; accountId: string; bic: string };
  lines: {
    id: string;
    description: string;
    quantity: string;
    unit: 'C62' | 'HUR' | 'DAY';
    unitPrice: string;
    net: string;
    vatCategory: 'S';
    vatRate: '19' | '7';
    allowance: string;
    charge: string;
  }[];
  adjustments: InvoiceInput['adjustments'];
  totals: Totals;
}
export function semanticIssues(snapshot: FrozenInvoice): Issue[] {
  const issues: Issue[] = [];
  const inspect = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      if (
        Array.from(value).some((char) => {
          const code = char.codePointAt(0)!;
          return !(
            code === 9 ||
            code === 10 ||
            code === 13 ||
            (code >= 32 && code <= 0xd7ff) ||
            (code >= 0xe000 && code <= 0xfffd) ||
            (code >= 0x10000 && code <= 0x10ffff)
          );
        })
      )
        issues.push(
          issue(
            'FLUX-XML-CHAR',
            path,
            'Entfernen Sie unzulässige Steuerzeichen aus diesem Feld.',
            'INPUT',
          ),
        );
    } else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        inspect(child, path ? `${path}.${key}` : key);
  };
  inspect(snapshot.input, '');
  inspect(snapshot.seller, 'seller');
  inspect(snapshot.buyer, 'buyer');
  const parsed = invoiceInputSchema.safeParse(snapshot.input);
  if (!parsed.success)
    issues.push(
      ...parsed.error.issues.map((e) =>
        issue(
          'FLUX-INPUT',
          e.path.join('.'),
          'Prüfen Sie die Rechnungsangaben.',
          'INPUT',
        ),
      ),
    );
  for (const kind of ['seller', 'buyer'] as const) {
    const p = partySchema.safeParse(snapshot[kind]);
    if (!p.success)
      issues.push(
        ...p.error.issues.map((e) =>
          issue(
            'FLUX-PARTY',
            `${kind}.${e.path.join('.')}`,
            'Bitte vervollständigen Sie die Adress- und Kontaktdaten.',
          ),
        ),
      );
  }
  const add = (rule: string, key: keyof typeof terms) => {
    const t = terms[key];
    issues.push(issue(rule, t.field, t.message, 'XRECHNUNG', t.bt, t.xml));
  };
  if (!snapshot.input.buyerReference.trim()) add('BR-DE-15', 'buyerReference');
  if (!snapshot.seller.vatId && !snapshot.seller.taxNumber)
    add('BR-DE-16', 'sellerTax');
  if (!snapshot.seller.contactName.trim()) add('BR-DE-5', 'sellerContact');
  if (!/\d{3}/.test(snapshot.seller.contactPhone.replace(/\D/g, '')))
    add('BR-DE-6', 'sellerPhone');
  if (!/^DE\d{20}$/.test(snapshot.seller.iban)) add('BR-DE-19', 'iban');
  if (parsed.success) {
    try {
      calculate(parsed.data);
    } catch {
      add('FLUX-TOTALS', 'totals');
    }
    if (
      parsed.data.lines.some(
        (l) => !/[1-9]/.test(l.quantity) || !/[1-9]/.test(l.unitPrice),
      )
    )
      issues.push(
        issue(
          'FLUX-SCOPE',
          'lines',
          'Für E-Rechnungen müssen Menge und Einzelpreis positiv sein.',
        ),
      );
  }
  return issues;
}
export function toSemantic(
  snapshot: FrozenInvoice,
  number: string,
): SemanticInvoice {
  const problems = semanticIssues(snapshot);
  if (problems.length) throw new SemanticError(problems);
  const input = invoiceInputSchema.parse(snapshot.input);
  const totals = calculate(input);
  return {
    id: number,
    typeCode: '380',
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    serviceDate: input.serviceDate,
    currency: 'EUR',
    buyerReference: input.buyerReference,
    notes: input.notes,
    seller: {
      ...snapshot.seller,
      electronicAddress: { scheme: 'EM', value: snapshot.seller.email },
    },
    buyer: {
      ...snapshot.buyer,
      electronicAddress: { scheme: 'EM', value: snapshot.buyer.email },
    },
    payment: {
      means: '58',
      accountId: snapshot.seller.iban,
      bic: snapshot.seller.bic,
    },
    lines: input.lines.map((l, i) => ({
      ...l,
      id: String(i + 1),
      net: totals.lines[i]!.net,
      vatCategory: 'S' as const,
    })),
    adjustments: input.adjustments,
    totals,
  };
}
export class SemanticError extends Error {
  constructor(public readonly issues: Issue[]) {
    super('SEMANTIC_INVALID');
  }
}

import type { Element } from '@xmldom/xmldom';
import { safeParseXml } from '../../einvoice/src/security';
export const parserVersion = 'flux-incoming/2';
const ns = {
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
};
function nodes(root: Element | undefined, path: string): Element[] {
  let current = root ? [root] : [];
  for (const segment of path.split('/')) {
    const [prefix, name] = segment.split(':');
    const uri = ns[prefix as keyof typeof ns];
    current = current.flatMap(
      (e) =>
        Array.from(e.childNodes).filter(
          (n) =>
            n.nodeType === 1 &&
            (n as Element).namespaceURI === uri &&
            (n as Element).localName === name,
        ) as Element[],
    );
  }
  return current;
}
function value(root: Element | undefined, path: string) {
  const found = nodes(root, path);
  if (found.length > 1) throw new Error('AMBIGUOUS_FIELD');
  const text = found[0]?.textContent?.trim() ?? '';
  if (text.length > 10000) throw new Error('FIELD_TOO_LONG');
  return text;
}
const first = (root: Element | undefined, path: string) => nodes(root, path)[0];
function date(text: string) {
  return /^\d{8}$/.test(text)
    ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`
    : text;
}
interface IncomingParty {
  name: string;
  address: string;
  vatId: string;
  endpoint: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}
export interface IncomingView {
  syntax: 'UBL' | 'CII';
  profile: string;
  number: string;
  type: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  buyerReference: string;
  orderReference: string;
  supplier: IncomingParty;
  recipient: IncomingParty;
  lines: {
    id: string;
    description: string;
    quantity: string;
    unit: string;
    price: string;
    net: string;
    vat: string;
    category: string;
  }[];
  payments: { means: string; iban: string; bic: string; reference: string }[];
  totals: { net: string; tax: string; gross: string; payable: string };
  notes: string[];
}
/** Namespace-qualified direct paths: never infer values or recalculate the issuer's figures. */
export function parseIncoming(bytes: Uint8Array): IncomingView {
  const root = safeParseXml(bytes).documentElement;
  if (!root) throw new Error('XML_MALFORMED');
  const ubl =
    ['Invoice', 'CreditNote'].includes(root.localName ?? '') &&
    root.namespaceURI ===
      `urn:oasis:names:specification:ubl:schema:xsd:${root.localName}-2`;
  const cii =
    root.localName === 'CrossIndustryInvoice' && root.namespaceURI === ns.rsm;
  if (!ubl && !cii) throw new Error('UNSUPPORTED_SYNTAX');
  if (ubl) {
    const party = (path: string) => {
      const p = first(root, `${path}/cac:Party`);
      const address = first(p, 'cac:PostalAddress');
      const legal = first(p, 'cac:PartyLegalEntity');
      return {
        name:
          value(legal, 'cbc:RegistrationName') ||
          value(first(p, 'cac:PartyName'), 'cbc:Name'),
        address: [
          'cbc:StreetName',
          'cbc:AdditionalStreetName',
          'cbc:PostalZone',
          'cbc:CityName',
          'cac:Country/cbc:IdentificationCode',
        ]
          .map((k) => value(address, k))
          .filter(Boolean)
          .join(', '),
        vatId: nodes(p, 'cac:PartyTaxScheme')
          .filter((t) => value(t, 'cac:TaxScheme/cbc:ID') === 'VAT')
          .map((t) => value(t, 'cbc:CompanyID'))
          .join(', '),
        endpoint: value(p, 'cbc:EndpointID'),
        contactName: value(p, 'cac:Contact/cbc:Name'),
        contactPhone: value(p, 'cac:Contact/cbc:Telephone'),
        contactEmail: value(p, 'cac:Contact/cbc:ElectronicMail'),
      };
    };
    const credit = root.localName === 'CreditNote';
    const lines = nodes(
      root,
      credit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine',
    );
    if (lines.length > 1000) throw new Error('TOO_MANY_LINES');
    return {
      syntax: 'UBL',
      profile: value(root, 'cbc:CustomizationID'),
      number: value(root, 'cbc:ID'),
      type: value(
        root,
        credit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode',
      ),
      issueDate: value(root, 'cbc:IssueDate'),
      dueDate: value(root, 'cbc:DueDate'),
      currency: value(root, 'cbc:DocumentCurrencyCode'),
      buyerReference: value(root, 'cbc:BuyerReference'),
      orderReference: value(root, 'cac:OrderReference/cbc:ID'),
      supplier: party('cac:AccountingSupplierParty'),
      recipient: party('cac:AccountingCustomerParty'),
      lines: lines.map((l) => ({
        id: value(l, 'cbc:ID'),
        description: value(l, 'cac:Item/cbc:Name'),
        quantity: value(
          l,
          credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity',
        ),
        unit:
          first(
            l,
            credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity',
          )?.getAttribute('unitCode') ?? '',
        price: value(l, 'cac:Price/cbc:PriceAmount'),
        net: value(l, 'cbc:LineExtensionAmount'),
        vat: value(l, 'cac:Item/cac:ClassifiedTaxCategory/cbc:Percent'),
        category: value(l, 'cac:Item/cac:ClassifiedTaxCategory/cbc:ID'),
      })),
      payments: nodes(root, 'cac:PaymentMeans').map((p) => ({
        means: value(p, 'cbc:PaymentMeansCode'),
        iban: value(p, 'cac:PayeeFinancialAccount/cbc:ID'),
        bic: value(
          p,
          'cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID',
        ),
        reference: value(p, 'cbc:PaymentID'),
      })),
      totals: {
        net: value(root, 'cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount'),
        tax: nodes(root, 'cac:TaxTotal')
          .filter(
            (t) =>
              first(t, 'cbc:TaxAmount')?.getAttribute('currencyID') ===
              value(root, 'cbc:DocumentCurrencyCode'),
          )
          .map((t) => value(t, 'cbc:TaxAmount'))
          .join(' / '),
        gross: value(root, 'cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount'),
        payable: value(root, 'cac:LegalMonetaryTotal/cbc:PayableAmount'),
      },
      notes: nodes(root, 'cbc:Note').map((n) => n.textContent ?? ''),
    };
  }
  const transaction = first(root, 'rsm:SupplyChainTradeTransaction');
  const agreement = first(transaction, 'ram:ApplicableHeaderTradeAgreement');
  const settlement = first(transaction, 'ram:ApplicableHeaderTradeSettlement');
  const totals = first(
    settlement,
    'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
  );
  const party = (path: string) => {
    const p = first(agreement, path);
    const a = first(p, 'ram:PostalTradeAddress');
    return {
      name: value(p, 'ram:Name'),
      address: [
        'ram:LineOne',
        'ram:LineTwo',
        'ram:PostcodeCode',
        'ram:CityName',
        'ram:CountryID',
      ]
        .map((k) => value(a, k))
        .filter(Boolean)
        .join(', '),
      vatId: nodes(p, 'ram:SpecifiedTaxRegistration')
        .filter((t) => first(t, 'ram:ID')?.getAttribute('schemeID') === 'VA')
        .map((t) => value(t, 'ram:ID'))
        .join(', '),
      endpoint: value(p, 'ram:URIUniversalCommunication/ram:URIID'),
      contactName: value(p, 'ram:DefinedTradeContact/ram:PersonName'),
      contactPhone: value(
        p,
        'ram:DefinedTradeContact/ram:TelephoneUniversalCommunication/ram:CompleteNumber',
      ),
      contactEmail: value(
        p,
        'ram:DefinedTradeContact/ram:EmailURIUniversalCommunication/ram:URIID',
      ),
    };
  };
  const lines = nodes(transaction, 'ram:IncludedSupplyChainTradeLineItem');
  if (lines.length > 1000) throw new Error('TOO_MANY_LINES');
  return {
    syntax: 'CII',
    profile: value(
      root,
      'rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID',
    ),
    number: value(root, 'rsm:ExchangedDocument/ram:ID'),
    type: value(root, 'rsm:ExchangedDocument/ram:TypeCode'),
    issueDate: date(
      value(root, 'rsm:ExchangedDocument/ram:IssueDateTime/udt:DateTimeString'),
    ),
    dueDate: date(
      value(
        settlement,
        'ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString',
      ),
    ),
    currency: value(settlement, 'ram:InvoiceCurrencyCode'),
    buyerReference: value(agreement, 'ram:BuyerReference'),
    orderReference: value(
      agreement,
      'ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID',
    ),
    supplier: party('ram:SellerTradeParty'),
    recipient: party('ram:BuyerTradeParty'),
    lines: lines.map((l) => ({
      id: value(l, 'ram:AssociatedDocumentLineDocument/ram:LineID'),
      description: value(l, 'ram:SpecifiedTradeProduct/ram:Name'),
      quantity: value(l, 'ram:SpecifiedLineTradeDelivery/ram:BilledQuantity'),
      unit:
        first(
          l,
          'ram:SpecifiedLineTradeDelivery/ram:BilledQuantity',
        )?.getAttribute('unitCode') ?? '',
      price: value(
        l,
        'ram:SpecifiedLineTradeAgreement/ram:NetPriceProductTradePrice/ram:ChargeAmount',
      ),
      net: value(
        l,
        'ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount',
      ),
      vat: value(
        l,
        'ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:RateApplicablePercent',
      ),
      category: value(
        l,
        'ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax/ram:CategoryCode',
      ),
    })),
    payments: nodes(settlement, 'ram:SpecifiedTradeSettlementPaymentMeans').map(
      (p) => ({
        means: value(p, 'ram:TypeCode'),
        iban: value(p, 'ram:PayeePartyCreditorFinancialAccount/ram:IBANID'),
        bic: value(
          p,
          'ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID',
        ),
        reference: value(settlement, 'ram:PaymentReference'),
      }),
    ),
    totals: {
      net: value(totals, 'ram:TaxBasisTotalAmount'),
      tax: nodes(totals, 'ram:TaxTotalAmount')
        .filter(
          (t) =>
            t.getAttribute('currencyID') ===
            value(settlement, 'ram:InvoiceCurrencyCode'),
        )
        .map((t) => t.textContent ?? '')
        .join(' / '),
      gross: value(totals, 'ram:GrandTotalAmount'),
      payable: value(totals, 'ram:DuePayableAmount'),
    },
    notes: nodes(
      root,
      'rsm:ExchangedDocument/ram:IncludedNote/ram:Content',
    ).map((n) => n.textContent ?? ''),
  };
}

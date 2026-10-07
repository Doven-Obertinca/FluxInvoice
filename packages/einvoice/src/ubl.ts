import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';
import { roundMoney } from '@flux/invoice-core';
import { manifest, type Party, type SemanticInvoice } from './semantic';
const ns = {
  invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};
const text = (
  node: XMLBuilder,
  name: string,
  value: string,
  attrs: Record<string, string> = {},
) => node.ele(name, attrs).txt(value).up();
function party(root: XMLBuilder, kind: 'supplier' | 'customer', p: Party) {
  const outer = root.ele(
    `cac:Accounting${kind === 'supplier' ? 'Supplier' : 'Customer'}Party`,
  );
  const node = outer.ele('cac:Party');
  text(node, 'cbc:EndpointID', p.email, { schemeID: 'EM' });
  const address = node.ele('cac:PostalAddress');
  text(address, 'cbc:StreetName', p.line1);
  text(address, 'cbc:CityName', p.city);
  text(address, 'cbc:PostalZone', p.postalCode);
  text(address.ele('cac:Country'), 'cbc:IdentificationCode', p.country);
  if (p.vatId) {
    const tax = node.ele('cac:PartyTaxScheme');
    text(tax, 'cbc:CompanyID', p.vatId);
    text(tax.ele('cac:TaxScheme'), 'cbc:ID', 'VAT');
  }
  if (kind === 'supplier' && p.taxNumber) {
    const tax = node.ele('cac:PartyTaxScheme');
    text(tax, 'cbc:CompanyID', p.taxNumber);
    text(tax.ele('cac:TaxScheme'), 'cbc:ID', 'FC');
  }
  text(node.ele('cac:PartyLegalEntity'), 'cbc:RegistrationName', p.name);
  if (kind === 'supplier') {
    const contact = node.ele('cac:Contact');
    text(contact, 'cbc:Name', p.contactName);
    text(contact, 'cbc:Telephone', p.contactPhone);
    text(contact, 'cbc:ElectronicMail', p.email);
  }
}
function taxCategory(node: XMLBuilder, rate: string, name = 'cac:TaxCategory') {
  const cat = node.ele(name);
  text(cat, 'cbc:ID', 'S');
  text(cat, 'cbc:Percent', rate);
  text(cat.ele('cac:TaxScheme'), 'cbc:ID', 'VAT');
}
export function serializeUbl(s: SemanticInvoice): Buffer {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('Invoice', {
    xmlns: ns.invoice,
    'xmlns:cac': ns.cac,
    'xmlns:cbc': ns.cbc,
  });
  text(root, 'cbc:CustomizationID', manifest.customizationId);
  text(root, 'cbc:ProfileID', manifest.businessProcess);
  text(root, 'cbc:ID', s.id);
  text(root, 'cbc:IssueDate', s.issueDate);
  text(root, 'cbc:DueDate', s.dueDate);
  text(root, 'cbc:InvoiceTypeCode', s.typeCode);
  if (s.notes) text(root, 'cbc:Note', s.notes);
  text(root, 'cbc:DocumentCurrencyCode', s.currency);
  text(root, 'cbc:BuyerReference', s.buyerReference);
  party(root, 'supplier', s.seller);
  party(root, 'customer', s.buyer);
  text(root.ele('cac:Delivery'), 'cbc:ActualDeliveryDate', s.serviceDate);
  const payment = root.ele('cac:PaymentMeans');
  text(payment, 'cbc:PaymentMeansCode', s.payment.means);
  const account = payment.ele('cac:PayeeFinancialAccount');
  text(account, 'cbc:ID', s.payment.accountId);
  text(account, 'cbc:Name', s.seller.name);
  if (s.payment.bic)
    text(
      account.ele('cac:FinancialInstitutionBranch'),
      'cbc:ID',
      s.payment.bic,
    );
  const amount = (node: XMLBuilder, name: string, value: string) =>
    text(node, name, value, { currencyID: 'EUR' });
  for (const a of s.adjustments) {
    const node = root.ele('cac:AllowanceCharge');
    text(node, 'cbc:ChargeIndicator', String(a.kind === 'CHARGE'));
    text(node, 'cbc:AllowanceChargeReason', a.reason);
    amount(node, 'cbc:Amount', roundMoney(a.amount));
    taxCategory(node, a.vatRate);
  }
  const taxes = root.ele('cac:TaxTotal');
  amount(taxes, 'cbc:TaxAmount', s.totals.tax);
  for (const t of s.totals.taxes) {
    const sub = taxes.ele('cac:TaxSubtotal');
    amount(sub, 'cbc:TaxableAmount', t.taxable);
    amount(sub, 'cbc:TaxAmount', t.tax);
    taxCategory(sub, t.rate);
  }
  const money = root.ele('cac:LegalMonetaryTotal');
  for (const [name, value] of [
    ['LineExtensionAmount', s.totals.lineNet],
    ['TaxExclusiveAmount', s.totals.net],
    ['TaxInclusiveAmount', s.totals.payable],
    ['AllowanceTotalAmount', s.totals.allowances],
    ['ChargeTotalAmount', s.totals.charges],
    ['PayableAmount', s.totals.payable],
  ])
    amount(money, `cbc:${name}`, value!);
  for (const line of s.lines) {
    const node = root.ele('cac:InvoiceLine');
    text(node, 'cbc:ID', line.id);
    text(node, 'cbc:InvoicedQuantity', line.quantity, { unitCode: line.unit });
    amount(node, 'cbc:LineExtensionAmount', line.net);
    for (const [kind, value] of [
      ['ALLOWANCE', line.allowance],
      ['CHARGE', line.charge],
    ] as const) {
      if (roundMoney(value) === '0.00') continue;
      const a = node.ele('cac:AllowanceCharge');
      text(a, 'cbc:ChargeIndicator', String(kind === 'CHARGE'));
      text(
        a,
        'cbc:AllowanceChargeReason',
        kind === 'CHARGE' ? 'Zuschlag' : 'Nachlass',
      );
      amount(a, 'cbc:Amount', roundMoney(value));
    }
    const item = node.ele('cac:Item');
    text(item, 'cbc:Name', line.description);
    taxCategory(item, line.vatRate, 'cac:ClassifiedTaxCategory');
    const price = node.ele('cac:Price');
    amount(price, 'cbc:PriceAmount', line.unitPrice);
    text(price, 'cbc:BaseQuantity', '1', { unitCode: line.unit });
  }
  return Buffer.from(
    root.end({ prettyPrint: true, indent: '  ', newline: '\n' }) + '\n',
    'utf8',
  );
}

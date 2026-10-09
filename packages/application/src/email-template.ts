import { z } from 'zod';
export const header = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^[^\r\n\x00-\x1f\x7f]+$/);
export const email = header.pipe(z.email().max(254));
export const variables = [
  'customer.name',
  'customer.contact_name',
  'invoice.number',
  'invoice.issue_date',
  'invoice.due_date',
  'invoice.total',
  'company.name',
  'company.email',
  'company.phone',
  'user.name',
] as const;
const template = z
  .string()
  .max(12000)
  .refine(
    (v) =>
      [...v.matchAll(/{{(.*?)}}/g)].every((m) =>
        (variables as readonly string[]).includes(m[1]!.trim()),
      ),
    'Unbekannte Vorlagenvariable',
  );
export const mailSettingsSchema = z
  .object({
    language: z.enum(['de', 'en']),
    senderName: header,
    replyTo: email,
    subject: template.pipe(header),
    message: template,
    signature: template,
    contactEmail: email,
    contactPhone: z.string().max(100),
  })
  .strict();
export type MailSettings = z.infer<typeof mailSettingsSchema>;
export const defaults = (language: 'de' | 'en') =>
  language === 'de'
    ? {
        subject: 'Rechnung {{invoice.number}} – {{company.name}}',
        message:
          'Guten Tag {{customer.contact_name}},\n\nanbei erhalten Sie unsere Rechnung {{invoice.number}} vom {{invoice.issue_date}} über {{invoice.total}}.\n\nDas Zahlungsziel ist der {{invoice.due_date}}.\n\nVielen Dank für die Zusammenarbeit.',
        signature:
          'Freundliche Grüße\n\n{{user.name}}\n{{company.name}}\n{{company.email}}\n{{company.phone}}',
      }
    : {
        subject: 'Invoice {{invoice.number}} – {{company.name}}',
        message:
          'Dear {{customer.contact_name}},\n\nPlease find attached invoice {{invoice.number}}, dated {{invoice.issue_date}}, for {{invoice.total}}.\n\nPayment is due on {{invoice.due_date}}.\n\nThank you for your business.',
        signature:
          'Kind regards,\n\n{{user.name}}\n{{company.name}}\n{{company.email}}\n{{company.phone}}',
      };
export function renderTemplate(source: string, values: Record<string, string>) {
  template.parse(source);
  return source
    .split('\n')
    .filter(
      (line) =>
        !line.includes('{{invoice.due_date}}') || !!values['invoice.due_date'],
    )
    .join('\n')
    .replace(/{{(.*?)}}/g, (_, key: string) => values[key.trim()] ?? '')
    .replace(/Guten Tag ,/g, 'Guten Tag,')
    .replace(/Dear ,/g, 'Hello,');
}
export const escapeHtml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function emailHtml(name: string, message: string) {
  return `<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f6f8;font:16px/1.6 Arial,sans-serif;color:#182233"><main style="max-width:640px;margin:24px auto;padding:32px;background:white;border-radius:8px"><strong>${escapeHtml(name)}</strong><div style="margin:28px 0;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(message)}</div><footer style="border-top:1px solid #ddd;padding-top:16px;font-size:12px;color:#697386">Versendet über ERechno</footer></main></body></html>`;
}
export const sendSchema = z
  .object({
    key: z.uuid(),
    recipient: email,
    subject: header,
    message: z.string().min(1).max(16000),
    resendOf: z.uuid().optional(),
  })
  .strict();

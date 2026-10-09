import { expect, it } from 'vitest';
import {
  defaults,
  renderTemplate,
  emailHtml,
  sendSchema,
  mailSettingsSchema,
} from '../packages/application/src/email-template';
it('renders German and English with absent contact and due dates', () => {
  for (const language of ['de', 'en'] as const) {
    const rendered = renderTemplate(defaults(language).message, {
      'invoice.number': 'RE-1',
      'invoice.issue_date': '08.10.2026',
      'invoice.total': '119,00 €',
    });
    expect(rendered).not.toContain('{{');
    expect(rendered).not.toContain('Dear ,');
    expect(rendered).not.toContain('Guten Tag ,');
    expect(rendered).not.toContain('due on');
    expect(rendered).not.toContain('Zahlungsziel');
  }
});
it('escapes all HTML and never interprets substituted values as templates', () => {
  const attack = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const output = emailHtml(
    attack,
    renderTemplate('{{customer.name}}', {
      'customer.name': attack + '{{user.name}}',
    }),
  );
  expect(output).not.toContain('<img');
  expect(output).not.toContain('<script>');
  expect(output).toContain('&lt;script&gt;');
  expect(output).toContain('{{user.name}}');
  expect(output).not.toContain('tracking');
  expect(() => renderTemplate('{{constructor}}', {})).toThrow();
});
it('rejects header injection, multiple recipients and attachment substitution', () => {
  const input = {
    key: crypto.randomUUID(),
    recipient: 'customer@example.test',
    subject: 'Invoice',
    message: 'Hello',
  };
  for (const update of [
    { recipient: 'a@b.test\r\nBcc: c@d.test' },
    { subject: 'Invoice\nBcc: attack' },
    { recipient: 'a@b.test,c@d.test' },
    { documentId: crypto.randomUUID() },
  ])
    expect(() => sendSchema.parse({ ...input, ...update })).toThrow();
  expect(() =>
    mailSettingsSchema.parse({
      language: 'de',
      senderName: 'Test\r\nBcc:x',
      replyTo: 'a@b.test',
      contactEmail: 'a@b.test',
      contactPhone: '',
      ...defaults('de'),
    }),
  ).toThrow();
});

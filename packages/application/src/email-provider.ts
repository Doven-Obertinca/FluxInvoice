import { requireCapability } from '@flux/shared';
import nodemailer from 'nodemailer';
import { email, emailHtml } from './email-template';
export interface DeliveryEnvelope {
  id: string;
  recipient: string;
  subject: string;
  message: string;
  senderName: string;
  replyTo: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
}
export interface EmailProvider {
  name: string;
  send(envelope: DeliveryEnvelope): Promise<string>;
}
// A gateway can adapt SES, Postmark or another provider without changing delivery commands.
// POST contract uses the attempt UUID as the provider idempotency key.
export function emailProvider(): EmailProvider {
  if (process.env.DELIVERY_GATEWAY_URL)
    return {
      name: 'gateway',
      async send(e) {
        const url = new URL(process.env.DELIVERY_GATEWAY_URL!);
        if (url.protocol !== 'https:' || !process.env.DELIVERY_GATEWAY_TOKEN)
          throw Error('MAIL_CONFIGURATION');
        const response = await fetch(url, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.DELIVERY_GATEWAY_TOKEN}`,
            'Idempotency-Key': e.id,
          },
          body: JSON.stringify({
            ...e,
            from: email.parse(process.env.DELIVERY_FROM),
            html: emailHtml(e.senderName, e.message),
            attachments: e.attachments.map((a) => ({
              ...a,
              content: a.content.toString('base64'),
            })),
          }),
        });
        if (!response.ok) throw Error('PROVIDER_REJECTED');
        const result = await response.json();
        if (typeof result.id !== 'string' || result.id.length > 300)
          throw Error('PROVIDER_RESPONSE');
        return result.id;
      },
    };
  return {
    name: 'smtp',
    async send(e) {
      requireCapability('transactionalEmail');
      const url = process.env.SMTP_URL;
      if (
        !url ||
        (['production', 'staging'].includes(process.env.APP_ENV ?? '') &&
          !process.env.DELIVERY_FROM)
      )
        throw Error('MAIL_CONFIGURATION');
      if (
        ['production', 'staging'].includes(process.env.APP_ENV ?? '') &&
        !url.startsWith('smtps:')
      )
        throw Error('MAIL_TLS_REQUIRED');
      const smtp = new URL(url);
      const transport = nodemailer.createTransport({
        host: smtp.hostname,
        port: Number(smtp.port || (smtp.protocol === 'smtps:' ? 465 : 25)),
        secure: smtp.protocol === 'smtps:',
        ...(smtp.username
          ? {
              auth: {
                user: decodeURIComponent(smtp.username),
                pass: decodeURIComponent(smtp.password),
              },
            }
          : {}),
        connectionTimeout: 15000,
        socketTimeout: 30000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const result = await transport.sendMail({
        from: {
          name: e.senderName,
          address: email.parse(
            process.env.DELIVERY_FROM ?? 'invoices@erechno.local',
          ),
        },
        replyTo: e.replyTo,
        to: e.recipient,
        subject: e.subject,
        text: e.message + '\n\nVersendet über ERechno',
        html: emailHtml(e.senderName, e.message),
        messageId: `<${e.id}@erechno.delivery>`,
        attachments: e.attachments,
      });
      if (!result.accepted?.length) throw Error('PROVIDER_REJECTED');
      return result.messageId;
    },
  };
}

# Invoice email delivery

Run migrations, configure SMTP, and run `npm run worker` alongside the app. Local development uses Mailpit (`smtp://127.0.0.1:1025`, inbox at http://127.0.0.1:8025). The company configures its display name, reply-to, contact details and German/English text under Settings → E-Mail & Versand. `DELIVERY_FROM` is an operator-controlled, verified sending address; configure SPF/DKIM/DMARC for its domain. Company email settings cannot impersonate an arbitrary envelope domain. Production SMTP requires SMTPS and an explicit `DELIVERY_FROM`.

Finalized invoices expose a composer and a mandatory preview. Individual edits do not alter defaults. The server resolves the invoice, issuance validation and archived document within the authenticated tenant. Only authoritative XRechnung XML is currently supported. Before submission the worker rechecks permission, document identity, byte length and SHA-256. No browser-supplied document or company identity is accepted.

Delivery is independent of fiscal, compliance and payment state. `QUEUED` means persisted for processing. `SUBMITTED` means accepted by the transport, not delivered. `DELIVERED`, `BOUNCED`, and `FAILED` receipts come from an authenticated provider gateway. SMTP/Mailpit acceptance remains `SUBMITTED`. Every attempt and transition is audited on the invoice timeline; the audit chain contains attempt/document identifiers and attachment digest, not message content.

Requests carry stable idempotency UUIDs. Repeating the same request returns its existing attempt; changing its payload conflicts. A new request for an already-sent invoice must reference the latest attempt as an intentional resend. Organization serialization prevents concurrent requests creating duplicate attempts. There is a 30-second resend cooldown and a 100-attempt per organization per hour limit. Read-only members cannot send. Worker authorization is checked again before external I/O.

SMTP cannot provide exactly-once delivery across a crash at the network boundary. A durable claim is committed before calling the provider, and claimed attempts are never automatically resubmitted. If acceptance cannot be determined, the attempt becomes FAILED with `SUBMISSION_UNKNOWN`; the UI asks the user to check receipt before deliberately resending. After a process crash, the existing outbox lease expires (three minutes) and the recovered job records this uncertainty. This favors avoiding duplicate invoices over silently retrying a possibly successful send. Monitor dead outbox jobs operationally.

## Provider gateway contract

`EmailProvider` isolates transports from delivery commands. SMTP is implemented with Nodemailer. To use an HTTPS provider gateway, set `DELIVERY_GATEWAY_URL`, `DELIVERY_GATEWAY_TOKEN`, `DELIVERY_FROM` and `DELIVERY_WEBHOOK_SECRET`. The gateway is an integration contract, not a bundled provider service. It adapts your provider's API and signature verification.

POST receives a bearer token, an `Idempotency-Key` equal to the delivery attempt UUID, and JSON containing `id`, `from`, `senderName`, `replyTo`, `recipient`, `subject`, `message`, escaped responsive `html`, and `attachments` with `filename`, `contentType` and base64 `content`. Return a successful JSON response `{ "id": "provider-message-id" }`. The gateway must persist and honor idempotency keys. Requests have bounded timeouts; redirects must not be followed.

The gateway verifies the upstream provider webhook, then POSTs raw JSON to `/api/v1/delivery/receipt`:

```json
{
  "eventId": "unique-provider-event",
  "attemptId": "attempt-uuid",
  "providerId": "provider-message-id",
  "status": "DELIVERED"
}
```

Allowed terminal statuses are DELIVERED, BOUNCED, FAILED. `x-delivery-timestamp` is Unix seconds and `x-delivery-signature` is hex HMAC-SHA256 of `timestamp + "." + rawBody`, signed with `DELIVERY_WEBHOOK_SECRET`. Timestamp tolerance is five minutes, request limit is 16 KiB. Replays are deduplicated by event ID, provider message identity must match, and terminal states cannot be overwritten. If the receipt precedes persisted provider acceptance, the endpoint returns 400; the gateway must retry with a fresh timestamp/signature. SMTP attempts do not accept gateway receipts. No public unauthenticated status update exists.

The envelope supports multiple typed attachments; add future PDF/ZUGFeRD only through an authoritative document resolver and validation policy. The delivery record reserves channel values EMAIL, PEPPOL, API and CUSTOMER_PORTAL, but the application exposes and processes only EMAIL. No Peppol support is claimed. Emails contain escaped plain text and HTML, a discreet ERechno footer, and no tracking pixels.

## Verification

`npm run check` covers lint, types, unit/integration tests and production build. `npm run test:e2e` requires PostgreSQL, installed compliance assets and Mailpit; it creates a disposable database, finalizes an invoice in the browser, checks composer defaults and preview, sends it, and inspects Mailpit's message and XML attachment. Integration tests cover failures, intentional retries, duplicate enqueue/worker calls, unauthorized sending, attachment tampering and signed receipt replay protection.

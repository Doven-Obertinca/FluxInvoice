import { sql } from 'drizzle-orm';
import {
  pgTable,
  customType,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  numeric,
  date,
  jsonb,
  unique,
  foreignKey,
  check,
  index,
} from 'drizzle-orm/pg-core';
const id = () => uuid('id').primaryKey().defaultRandom();
const created = (name = 'created_at') =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const roleEnum = pgEnum('organization_role', [
  'OWNER',
  'ADMIN',
  'ACCOUNTANT',
  'MEMBER',
  'VIEWER',
]);
export const statusEnum = pgEnum('invoice_status', [
  'DRAFT',
  'VALIDATED',
  'FINALIZED',
  'SENT',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'CREDITED',
]);
export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: created(),
  updatedAt: created('updated_at'),
});
export const session = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: created(),
    updatedAt: created('updated_at'),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);
export const account = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: created(),
    updatedAt: created('updated_at'),
  },
  (t) => [
    unique().on(t.providerId, t.accountId),
    index('account_user_idx').on(t.userId),
  ],
);
export const verification = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: created('updated_at'),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);
export const rateLimit = pgTable('rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    line1: text('line1').notNull(),
    city: text('city').notNull(),
    postalCode: text('postal_code').notNull(),
    country: text('country').notNull().default('DE'),
    vatId: text('vat_id').notNull(),
    taxNumber: text('tax_number').notNull(),
    iban: text('iban').notNull(),
    bic: text('bic').notNull(),
    currency: text('currency').notNull().default('EUR'),
    numberPrefix: text('number_prefix').notNull().default(''),
    contactName: text('contact_name').notNull().default(''),
    contactPhone: text('contact_phone').notNull().default(''),
    createdAt: created(),
  },
  (t) => [
    check('org_currency', sql`${t.currency} = 'EUR'`),
    check('org_country', sql`${t.country} = 'DE'`),
    check('org_prefix', sql`${t.numberPrefix} ~ '^[A-Z0-9-]{0,20}$'`),
  ],
);
const tenant = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organizations.id);
export const members = pgTable(
  'organization_members',
  {
    id: id(),
    organizationId: tenant(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    role: roleEnum('role').notNull(),
    createdAt: created(),
  },
  (t) => [
    unique().on(t.organizationId, t.userId),
    index('member_user_idx').on(t.userId),
  ],
);
export const customers = pgTable(
  'customers',
  {
    id: id(),
    organizationId: tenant(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    vatId: text('vat_id').notNull(),
    createdAt: created(),
    updatedAt: created('updated_at'),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    index('customers_tenant_name').on(t.organizationId, t.name),
  ],
);
export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: id(),
    organizationId: tenant(),
    customerId: uuid('customer_id').notNull(),
    line1: text('line1').notNull(),
    city: text('city').notNull(),
    postalCode: text('postal_code').notNull(),
    country: text('country').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }),
    unique().on(t.organizationId, t.customerId),
    check('address_country', sql`${t.country} = 'DE'`),
  ],
);
const amount = (name: string) =>
  numeric(name, { precision: 18, scale: 2 }).notNull();
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    organizationId: tenant(),
    customerId: uuid('customer_id').notNull(),
    status: statusEnum('status').notNull().default('DRAFT'),
    revision: integer('revision').notNull().default(1),
    number: text('number'),
    finalizationPending: boolean('finalization_pending')
      .notNull()
      .default(false),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    serviceDate: date('service_date').notNull(),
    currency: text('currency').notNull().default('EUR'),
    buyerReference: text('buyer_reference').notNull(),
    notes: text('notes').notNull(),
    net: amount('net'),
    tax: amount('tax'),
    payable: amount('payable'),
    createdAt: created(),
    updatedAt: created('updated_at'),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.number),
    foreignKey({
      columns: [t.organizationId, t.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }),
    check('invoice_currency', sql`${t.currency} = 'EUR'`),
    check('invoice_dates', sql`${t.dueDate} >= ${t.issueDate}`),
    check(
      'invoice_totals',
      sql`${t.net} >= 0 AND ${t.tax} >= 0 AND ${t.payable} = ${t.net}+${t.tax}`,
    ),
    check('invoice_revision', sql`${t.revision} > 0`),
    index('invoices_tenant_created').on(t.organizationId, t.createdAt),
  ],
);
const invoiceId = () => uuid('invoice_id').notNull();
export const invoiceParties = pgTable(
  'invoice_parties',
  {
    id: id(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    line1: text('line1').notNull(),
    city: text('city').notNull(),
    postalCode: text('postal_code').notNull(),
    country: text('country').notNull(),
    vatId: text('vat_id').notNull(),
    taxNumber: text('tax_number'),
    iban: text('iban'),
    bic: text('bic'),
    contactName: text('contact_name').notNull().default(''),
    contactPhone: text('contact_phone').notNull().default(''),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    unique().on(t.organizationId, t.invoiceId, t.kind),
    check('party_kind', sql`${t.kind} IN ('SELLER','BUYER')`),
  ],
);
export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: id(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    position: integer('position').notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 6 }).notNull(),
    unit: text('unit').notNull(),
    vatRate: text('vat_rate').notNull(),
    allowance: amount('allowance'),
    charge: amount('charge'),
    net: amount('net'),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    unique().on(t.organizationId, t.invoiceId, t.position),
    check(
      'line_bounds',
      sql`${t.quantity}>0 AND ${t.unitPrice}>=0 AND ${t.net}>=0 AND ${t.allowance}>=0 AND ${t.charge}>=0 AND ${t.position}>=0`,
    ),
    check('line_vat', sql`${t.vatRate} IN ('19','7')`),
    check('line_unit', sql`${t.unit} IN ('C62','HUR','DAY')`),
  ],
);
export const invoiceAdjustments = pgTable(
  'invoice_adjustments',
  {
    id: id(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    amount: amount('amount'),
    vatRate: text('vat_rate').notNull(),
  },
  (t) => [
    index('adjustments_invoice').on(t.organizationId, t.invoiceId),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    check(
      'adjustment_bounds',
      sql`${t.amount}>=0 AND ${t.kind} IN ('ALLOWANCE','CHARGE') AND ${t.vatRate} IN ('19','7')`,
    ),
  ],
);
export const invoiceTaxSummaries = pgTable(
  'invoice_tax_summaries',
  {
    id: id(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    rate: text('rate').notNull(),
    taxable: amount('taxable'),
    tax: amount('tax'),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    unique().on(t.organizationId, t.invoiceId, t.rate),
    check(
      'tax_summary_bounds',
      sql`${t.taxable}>=0 AND ${t.tax}>=0 AND ${t.rate} IN ('19','7')`,
    ),
  ],
);
export const sequences = pgTable(
  'invoice_number_sequences',
  {
    id: id(),
    organizationId: tenant(),
    year: integer('year').notNull(),
    value: bigint('value', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    unique().on(t.organizationId, t.year),
    check(
      'sequence_bounds',
      sql`${t.value} >= 0 AND ${t.year} BETWEEN 2000 AND 9999`,
    ),
  ],
);
export const validationRuns = pgTable(
  'validation_runs',
  {
    id: id(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    revision: integer('revision').notNull(),
    profile: text('profile').notNull(),
    rulesetVersion: text('ruleset_version').notNull(),
    valid: boolean('valid').notNull(),
    candidateHash: text('candidate_hash'),
    profileVersion: text('profile_version'),
    validatorVersion: text('validator_version'),
    cenVersion: text('cen_version'),
    manifestHash: text('manifest_hash'),
    reportHash: text('report_hash'),
    purpose: text('purpose').notNull().default('DRAFT'),
    durationMs: integer('duration_ms'),
    createdAt: created(),
  },
  (t) => [
    index('validation_invoice').on(
      t.organizationId,
      t.invoiceId,
      t.revision,
      t.createdAt,
    ),
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
  ],
);
export const validationIssues = pgTable(
  'validation_issues',
  {
    id: id(),
    organizationId: tenant(),
    runId: uuid('run_id').notNull(),
    code: text('code').notNull(),
    ruleId: text('rule_id').notNull(),
    severity: text('severity').notNull(),
    fieldPath: text('field_path').notNull(),
    businessTerm: text('business_term').notNull().default(''),
    technicalLocation: text('technical_location').notNull().default(''),
    profileVersion: text('profile_version').notNull().default(''),
    message: text('message').notNull(),
    source: text('source').notNull(),
    profile: text('profile').notNull(),
    rulesetVersion: text('ruleset_version').notNull(),
  },
  (t) => [
    index('issues_run').on(t.organizationId, t.runId),
    foreignKey({
      columns: [t.organizationId, t.runId],
      foreignColumns: [validationRuns.organizationId, validationRuns.id],
    }),
    check('issue_severity', sql`${t.severity} IN ('ERROR','WARNING')`),
  ],
);
export const invoiceDocuments = pgTable(
  'invoice_documents',
  {
    id: id(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    objectKey: text('object_key').notNull().unique(),
    jobId: uuid('job_id'),
    validationRunId: uuid('validation_run_id'),
    manifestHash: text('manifest_hash'),
    archiveMode: text('archive_mode').notNull().default('LOCAL'),
    objectVersion: text('object_version').notNull(),
    sha256: text('sha256').notNull(),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'bigint' }).notNull(),
    profile: text('profile').notNull(),
    profileVersion: text('profile_version').notNull(),
    rulesetVersion: text('ruleset_version').notNull(),
    retentionPolicyVersion: text('retention_policy_version').notNull(),
    retainUntil: timestamp('retain_until', { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.invoiceId),
    foreignKey({
      columns: [t.organizationId, t.validationRunId],
      foreignColumns: [validationRuns.organizationId, validationRuns.id],
    }),
    index('documents_invoice').on(t.organizationId, t.invoiceId),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    check(
      'document_integrity',
      sql`${t.sha256} ~ '^[a-f0-9]{64}$' AND ${t.size}>0`,
    ),
  ],
);
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: tenant(),
    actorId: text('actor_id').notNull(),
    eventType: text('event_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    timestamp: timestamp('timestamp', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    requestId: uuid('request_id').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull(),
    previousHash: text('previous_hash'),
    eventHash: text('event_hash').notNull(),
    sequence: bigint('sequence', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.sequence),
    check(
      'audit_hash',
      sql`${t.eventHash} ~ '^[a-f0-9]{64}$' AND (${t.previousHash} IS NULL OR ${t.previousHash} ~ '^[a-f0-9]{64}$')`,
    ),
  ],
);
export const outbox = pgTable(
  'outbox_events',
  {
    id: id(),
    organizationId: tenant(),
    eventType: text('event_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    requestId: uuid('request_id').notNull(),
    status: text('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: created('available_at'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    leaseToken: uuid('lease_token'),
    lastErrorCode: text('last_error_code'),
    createdAt: created(),
  },
  (t) => [
    check(
      'outbox_status',
      sql`${t.status} IN ('PENDING','PROCESSING','DONE','DEAD') AND ${t.attempts}>=0`,
    ),
    unique().on(t.organizationId, t.id),
    index('outbox_poll').on(t.status, t.availableAt),
    index('outbox_lease').on(t.status, t.leaseUntil),
  ],
);
export const apiKeys = pgTable('api_keys', {
  id: id(),
  organizationId: tenant(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  scopes: text('scopes').array().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: created(),
});
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: id(),
    organizationId: tenant(),
    url: text('url').notNull(),
    secretReference: text('secret_reference').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    createdAt: created(),
  },
  (t) => [unique().on(t.organizationId, t.id)],
);
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: id(),
    organizationId: tenant(),
    endpointId: uuid('endpoint_id').notNull(),
    eventId: uuid('event_id').notNull(),
    attempt: integer('attempt').notNull(),
    responseStatus: integer('response_status'),
    latencyMs: integer('latency_ms'),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.endpointId],
      foreignColumns: [webhookEndpoints.organizationId, webhookEndpoints.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [outbox.organizationId, outbox.id],
    }),
    unique().on(t.organizationId, t.endpointId, t.eventId, t.attempt),
  ],
);
export const integrationConnections = pgTable('integration_connections', {
  id: id(),
  organizationId: tenant(),
  provider: text('provider').notNull(),
  credentialReference: text('credential_reference').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: created(),
});
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: id(),
    organizationId: tenant(),
    actorId: text('actor_id').notNull(),
    operation: text('operation').notNull(),
    key: uuid('key').notNull(),
    requestHash: text('request_hash').notNull(),
    resourceId: uuid('resource_id').notNull(),
    createdAt: created(),
  },
  (t) => [unique().on(t.organizationId, t.operation, t.key)],
);

export const einvoiceJobs = pgTable(
  'einvoice_jobs',
  {
    id: id(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    revision: integer('revision').notNull(),
    kind: text('kind').notNull(),
    state: text('state').notNull().default('QUEUED'),
    actorId: text('actor_id').notNull(),
    requestId: uuid('request_id').notNull(),
    profileId: text('profile_id').notNull(),
    snapshotHash: text('snapshot_hash').notNull(),
    number: text('number'),
    candidateHash: text('candidate_hash'),
    objectKey: text('object_key'),
    objectVersion: text('object_version'),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: created(),
    updatedAt: created('updated_at'),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.invoiceId, t.revision, t.kind),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    check('job_kind', sql`${t.kind} IN ('VALIDATE','FINALIZE')`),
    check(
      'job_state',
      sql`${t.state} IN ('QUEUED','VALIDATING','ARCHIVING','COMPLETED','FAILED')`,
    ),
    index('jobs_reconcile').on(t.state, t.updatedAt),
  ],
);
export const documentChecks = pgTable(
  'document_checks',
  {
    id: id(),
    organizationId: tenant(),
    documentId: uuid('document_id').notNull(),
    valid: boolean('valid').notNull(),
    reason: text('reason').notNull(),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.documentId],
      foreignColumns: [invoiceDocuments.organizationId, invoiceDocuments.id],
    }),
    index('document_checks_latest').on(
      t.organizationId,
      t.documentId,
      t.createdAt,
    ),
  ],
);

// Original fiscal bytes are authoritative. Parsed JSON is a disposable, versioned
// read projection; it is never passed to the outgoing invoice command.
const binary = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
export const incomingDocuments = pgTable(
  'incoming_documents',
  {
    id: id(),
    organizationId: tenant(),
    actorId: text('actor_id').notNull(),
    requestKey: uuid('request_key').notNull(),
    requestHash: text('request_hash').notNull(),
    source: text('source').notNull(),
    filename: text('filename').notNull(),
    kind: text('kind').notNull(),
    original: binary('original').notNull(),
    sha256: text('sha256').notNull(),
    size: integer('size').notNull(),
    receivedAt: created('received_at'),
    state: text('state').notNull().default('RECEIVED'),
    objectKey: text('object_key'),
    objectVersion: text('object_version'),
    archiveMode: text('archive_mode'),
    retainUntil: timestamp('retain_until', { withTimezone: true }).notNull(),
    parserVersion: text('parser_version'),
    parsed:
      jsonb('parsed').$type<import('../../incoming/src/parser').IncomingView>(),
    validation: text('validation').notNull().default('PENDING'),
    profileId: text('profile_id'),
    manifestHash: text('manifest_hash'),
    reportHash: text('report_hash'),
    issues: jsonb('issues')
      .$type<import('../../einvoice/src/semantic').Issue[]>()
      .notNull()
      .default([]),
    errorCode: text('error_code'),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.requestKey),
    index('incoming_tenant_received').on(t.organizationId, t.receivedAt, t.id),
    check(
      'incoming_bounds',
      sql`${t.size} > 0 AND ${t.size} <= 2097152 AND octet_length(${t.original}) = ${t.size}`,
    ),
    check(
      'incoming_state',
      sql`${t.state} IN ('RECEIVED','REVIEW','ERROR','APPROVED')`,
    ),
    check(
      'incoming_validation',
      sql`${t.validation} IN ('PENDING','VALID','INVALID','UNSUPPORTED','ERROR')`,
    ),
    check('incoming_kind', sql`${t.kind} IN ('xml','pdf')`),
    check(
      'incoming_source',
      sql`${t.source} IN ('UPLOAD','EMAIL','API','PEPPOL')`,
    ),
  ],
);
export const incomingChecks = pgTable(
  'incoming_checks',
  {
    id: id(),
    organizationId: tenant(),
    incomingId: uuid('incoming_id').notNull(),
    createdAt: created(),
    validation: text('validation').notNull(),
    profileId: text('profile_id'),
    manifestHash: text('manifest_hash'),
    reportHash: text('report_hash'),
    issues: jsonb('issues')
      .$type<import('../../einvoice/src/semantic').Issue[]>()
      .notNull(),
    parserVersion: text('parser_version').notNull(),
    errorCode: text('error_code'),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.incomingId],
      foreignColumns: [incomingDocuments.organizationId, incomingDocuments.id],
    }),
    index('incoming_checks_document').on(
      t.organizationId,
      t.incomingId,
      t.createdAt,
    ),
  ],
);

export const emailSettings = pgTable('email_settings', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id),
  settings: jsonb('settings')
    .$type<import('../../application/src/email-template').MailSettings>()
    .notNull(),
});
export const invoiceDeliveries = pgTable(
  'invoice_deliveries',
  {
    id: uuid('id').primaryKey(),
    organizationId: tenant(),
    invoiceId: invoiceId(),
    documentId: uuid('document_id').notNull(),
    actorId: text('actor_id').notNull(),
    requestId: uuid('request_id').notNull(),
    requestKey: uuid('request_key').notNull(),
    requestHash: text('request_hash').notNull(),
    channel: text('channel').notNull().default('EMAIL'),
    status: text('status').notNull().default('QUEUED'),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    senderName: text('sender_name').notNull(),
    replyTo: text('reply_to').notNull(),
    attachmentHash: text('attachment_hash').notNull(),
    filename: text('filename').notNull(),
    providerId: text('provider_id'),
    provider: text('provider'),
    errorCode: text('error_code'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: created(),
    updatedAt: created('updated_at'),
    resendOf: uuid('resend_of'),
  },
  (t) => [
    unique().on(t.organizationId, t.requestKey),
    foreignKey({
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.documentId],
      foreignColumns: [invoiceDocuments.organizationId, invoiceDocuments.id],
    }),
    foreignKey({ columns: [t.resendOf], foreignColumns: [t.id] }),
    check(
      'delivery_channel',
      sql`${t.channel} IN ('EMAIL','PEPPOL','API','CUSTOMER_PORTAL')`,
    ),
    check(
      'delivery_status',
      sql`${t.status} IN ('QUEUED','SUBMITTED','DELIVERED','BOUNCED','FAILED')`,
    ),
    index('deliveries_invoice').on(t.organizationId, t.invoiceId, t.createdAt),
  ],
);
export const deliveryReceipts = pgTable('delivery_receipts', {
  eventId: text('event_id').primaryKey(),
  attemptId: uuid('attempt_id')
    .notNull()
    .references(() => invoiceDeliveries.id),
  createdAt: created(),
});

// This module contains no credentials and never includes values in errors.
export function hostedEnvironment(e: Record<string, string | undefined>) {
  return (
    e.VERCEL === '1' || ['production', 'staging'].includes(e.APP_ENV ?? '')
  );
}
export function publicHost(host: string) {
  return (
    host.includes('.') &&
    !/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
      host,
    ) &&
    !/(\.(test|local|localhost|invalid|example)$|^example\.)/i.test(host)
  );
}
export function productionDatabase(url: string, name = 'DATABASE_URL') {
  try {
    const u = new URL(url);
    if (
      !['postgres:', 'postgresql:'].includes(u.protocol) ||
      !publicHost(u.hostname) ||
      !u.username ||
      !u.password ||
      u.pathname === '/' ||
      !['verify-full'].includes(u.searchParams.get('sslmode') ?? '') ||
      u.searchParams.get('uselibpqcompat') === 'true'
    )
      throw Error();
  } catch {
    throw new Error(
      `Configuration: ${name} requires external PostgreSQL with credentials and sslmode=verify-full (verified TLS)`,
    );
  }
}
export function validateProduction(
  e: Record<string, string | undefined>,
  role: 'web' | 'worker' = 'web',
) {
  if (!hostedEnvironment(e)) return;
  const errors: string[] = [];
  const beta = e.ERECHNO_BETA_MODE === 'true';
  if (e.ERECHNO_BETA_MODE && !['true', 'false'].includes(e.ERECHNO_BETA_MODE))
    errors.push('ERECHNO_BETA_MODE must be true or false');
  const require = (name: string) => {
    if (!e[name]?.trim()) errors.push(`${name} is required`);
  };
  if (!['production', 'staging'].includes(e.APP_ENV ?? ''))
    errors.push('APP_ENV must be production or staging on hosted deployments');
  for (const name of [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'APP_URL',
    ...(!beta
      ? [
          'SMTP_URL',
          'MAIL_FROM',
          'ARCHIVE_BUCKET',
          'ARCHIVE_KMS_KEY_ARN',
          'AWS_REGION',
        ]
      : []),
  ])
    require(name);
  for (const name of ['APP_URL', 'BETTER_AUTH_URL', 'DELIVERY_GATEWAY_URL']) {
    if (!e[name]) continue;
    try {
      const u = new URL(e[name]!);
      if (
        u.protocol !== 'https:' ||
        !publicHost(u.hostname) ||
        u.username ||
        u.password ||
        u.hash ||
        (name !== 'DELIVERY_GATEWAY_URL' && (u.pathname !== '/' || u.search))
      )
        throw Error();
    } catch {
      errors.push(
        `${name} requires a public HTTPS ${name === 'DELIVERY_GATEWAY_URL' ? 'endpoint' : 'origin'}`,
      );
    }
  }
  if (
    e.APP_URL &&
    e.BETTER_AUTH_URL &&
    e.APP_URL.replace(/\/$/, '') !== e.BETTER_AUTH_URL.replace(/\/$/, '')
  )
    errors.push('APP_URL and BETTER_AUTH_URL must have the same origin');
  const secret = e.BETTER_AUTH_SECRET ?? '';
  if (
    secret.length < 32 ||
    new Set(secret).size < 12 ||
    /replace|example|development|test.secret|change.?me|placeholder/i.test(
      secret,
    )
  )
    errors.push(
      'BETTER_AUTH_SECRET requires a fresh random secret of at least 32 characters',
    );
  for (const name of [
    'DATABASE_URL',
    ...(e.BILLING_ENABLED === 'true' ? ['BILLING_DATABASE_URL'] : []),
  ]) {
    try {
      productionDatabase(e[name] ?? '', name);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  if (!beta || e.SMTP_URL)
    try {
      const u = new URL(e.SMTP_URL ?? '');
      if (
        u.protocol !== 'smtps:' ||
        !publicHost(u.hostname) ||
        !u.username ||
        !u.password ||
        u.search ||
        u.hash
      )
        throw Error();
    } catch {
      errors.push(
        'SMTP_URL requires authenticated smtps:// on a public provider host',
      );
    }
  for (const name of ['MAIL_FROM', 'DELIVERY_FROM', 'SUPPORT_EMAIL']) {
    if (name === 'DELIVERY_FROM' && role === 'worker') require(name);
    if (
      e[name] &&
      (!/^[^\s<>@]+@[^\s<>@]+$/.test(e[name]!) ||
        !publicHost(e[name]!.split('@')[1]!))
    )
      errors.push(`${name} requires a real provider-verified email address`);
  }
  if (!beta && e.ARCHIVE_MODE !== 'S3_OBJECT_LOCK')
    errors.push(
      'ARCHIVE_MODE must be S3_OBJECT_LOCK; local disk is not production storage',
    );
  if (e.DELIVERY_GATEWAY_URL) require('DELIVERY_GATEWAY_TOKEN');
  // The default AWS SDK chain cannot exchange a Vercel OIDC token by itself.
  if (!beta && e.VERCEL === '1') {
    require('AWS_ACCESS_KEY_ID');
    require('AWS_SECRET_ACCESS_KEY');
  }
  if (!beta && !!e.AWS_ACCESS_KEY_ID !== !!e.AWS_SECRET_ACCESS_KEY)
    errors.push(
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be supplied together',
    );
  if (
    !beta &&
    e.ARCHIVE_BUCKET &&
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(e.ARCHIVE_BUCKET)
  )
    errors.push('ARCHIVE_BUCKET requires a valid S3 bucket name');
  if (
    !beta &&
    e.ARCHIVE_KMS_KEY_ARN &&
    !/^arn:aws[a-z-]*:kms:[a-z0-9-]+:[0-9]{12}:key\/[a-zA-Z0-9-]+$/.test(
      e.ARCHIVE_KMS_KEY_ARN,
    )
  )
    errors.push('ARCHIVE_KMS_KEY_ARN requires a concrete KMS key ARN');
  if (!beta && e.AWS_REGION && !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(e.AWS_REGION))
    errors.push('AWS_REGION requires an AWS region identifier');
  if (e.DELIVERY_WEBHOOK_SECRET && e.DELIVERY_WEBHOOK_SECRET.length < 32)
    errors.push('DELIVERY_WEBHOOK_SECRET requires at least 32 characters');
  if (role === 'worker') {
    if (e.VERCEL === '1')
      errors.push('The persistent worker cannot run on Vercel');
    for (const name of ['COMPLIANCE_HOME', 'JAVA_BIN']) {
      require(name);
      if (e[name] && !e[name]!.startsWith('/'))
        errors.push(`${name} requires an absolute path on the worker host`);
    }
  }
  if (e.BILLING_ENABLED && !['true', 'false'].includes(e.BILLING_ENABLED))
    errors.push('BILLING_ENABLED must be true or false');
  if (e.BILLING_ENABLED === 'true') {
    for (const name of [
      'BILLING_DATABASE_URL',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_STARTER',
      'STRIPE_PRICE_BUSINESS',
      'STRIPE_PRICE_PRO',
      'STRIPE_PORTAL_CONFIGURATION',
    ])
      require(name);
    const prices = [
      'STRIPE_PRICE_STARTER',
      'STRIPE_PRICE_BUSINESS',
      'STRIPE_PRICE_PRO',
    ].map((name) => e[name]);
    if (
      prices.some((id) => !/^price_[A-Za-z0-9]+$/.test(id ?? '')) ||
      new Set(prices).size !== 3
    )
      errors.push('Stripe prices require three distinct provider price IDs');
    if (!/^bpc_[A-Za-z0-9]+$/.test(e.STRIPE_PORTAL_CONFIGURATION ?? ''))
      errors.push('STRIPE_PORTAL_CONFIGURATION requires a provider portal ID');
    if (!e.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))
      errors.push('STRIPE_WEBHOOK_SECRET requires the provider signing secret');
    if (e.DATABASE_URL && e.BILLING_DATABASE_URL) {
      try {
        if (
          new URL(e.DATABASE_URL).username ===
          new URL(e.BILLING_DATABASE_URL).username
        )
          errors.push(
            'BILLING_DATABASE_URL requires a separate restricted database role',
          );
      } catch {
        /* URL errors are reported above. */
      }
    }
    if (
      e.APP_ENV === 'production' &&
      !e.STRIPE_SECRET_KEY?.startsWith('sk_live_')
    )
      errors.push('STRIPE_SECRET_KEY must use live mode in production');
  }
  if (errors.length)
    throw new Error(
      `Production configuration invalid:\n- ${[...new Set(errors)].join('\n- ')}`,
    );
}

// Migration/operations identity is deliberately independent of web/mail credentials.
export function databaseUrl() {
  const hosted =
    hostedEnvironment(process.env) || process.env.NODE_ENV === 'production';
  const url = process.env.DATABASE_URL;
  if (hosted) productionDatabase(url ?? '');
  if (!url && !['development', 'test'].includes(process.env.APP_ENV ?? ''))
    throw new Error(
      'Configuration: DATABASE_URL is required; no implicit local database',
    );
  return url ?? 'postgresql://flux:flux@localhost:5432/fluxinvoice';
}

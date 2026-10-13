import { AppError } from './errors';
import { hostedEnvironment, publicHost } from './production';

// Beta always disables archival, even if stale S3 settings remain configured.
// Configuration is not proof of Object Lock: S3Archive verifies it before writing.
export function runtimeCapabilities(
  e: Record<string, string | undefined> = process.env,
) {
  const beta = e.ERECHNO_BETA_MODE === 'true';
  let transactionalEmail = false;
  try {
    const smtp = new URL(e.SMTP_URL ?? '');
    transactionalEmail =
      !!e.MAIL_FROM &&
      (!hostedEnvironment(e) ||
        (smtp.protocol === 'smtps:' &&
          publicHost(smtp.hostname) &&
          !!smtp.username &&
          !!smtp.password));
  } catch {
    /* Missing transport is an unavailable capability. */
  }
  return {
    beta,
    compliantArchive: !beta,
    invoiceFinalization: !beta,
    invoiceDelivery: !beta,
    transactionalEmail,
    backgroundProcessing: !beta && e.VERCEL !== '1',
    invoiceValidation: !beta,
  };
}
export type RuntimeCapability = Exclude<
  keyof ReturnType<typeof runtimeCapabilities>,
  'beta'
>;
export class CapabilityUnavailableError extends AppError {
  constructor(public readonly capability: RuntimeCapability) {
    super(
      'CAPABILITY_UNAVAILABLE',
      ['compliantArchive', 'invoiceFinalization', 'invoiceDelivery'].includes(
        capability,
      )
        ? 'Die rechtskonforme Finalisierung und Archivierung ist während der Beta noch nicht aktiviert.'
        : capability === 'transactionalEmail'
          ? 'Der E-Mail-Versand ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.'
          : 'Diese Funktion wird während der ERechno Beta noch vorbereitet.',
    );
  }
}
export function requireCapability(capability: RuntimeCapability) {
  if (!runtimeCapabilities()[capability])
    throw new CapabilityUnavailableError(capability);
}
export function authenticationRequiresEmail(path: string) {
  return [
    '/sign-up/email',
    '/request-password-reset',
    '/send-verification-email',
    '/change-email',
  ].includes(path);
}

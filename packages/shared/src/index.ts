import { z } from 'zod';
export class AppError extends Error {
  constructor(
    public readonly code:
      | 'AUTHENTICATION'
      | 'AUTHORIZATION'
      | 'VALIDATION'
      | 'CONFLICT'
      | 'NOT_FOUND'
      | 'EXTERNAL_SERVICE'
      | 'RATE_LIMIT',
    message: string,
  ) {
    super(message);
  }
}
export const environmentSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
    DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:/.test(v)),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    SMTP_URL: z.url().optional(),
    MAIL_FROM: z.email().default('noreply@example.test'),
  })
  .superRefine((e, ctx) => {
    if (['production', 'staging'].includes(e.APP_ENV)) {
      if (!e.BETTER_AUTH_URL.startsWith('https://'))
        ctx.addIssue({
          code: 'custom',
          path: ['BETTER_AUTH_URL'],
          message: 'HTTPS required',
        });
      if (!e.SMTP_URL)
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_URL'],
          message: 'SMTP required',
        });
    }
  });
export function environment() {
  return environmentSchema.parse(process.env);
}
export const addressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(20),
    country: z.literal('DE'),
  })
  .strict();
export const customerSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email().max(254),
    vatId: z
      .string()
      .regex(/^DE\d{9}$/)
      .or(z.literal('')),
    address: addressSchema,
  })
  .strict();
export const companySchema = customerSchema.extend({
  contactName: z.string().trim().max(120).default(''),
  contactPhone: z.string().trim().max(40).default(''),
  taxNumber: z.string().max(40),
  iban: z
    .string()
    .regex(/^DE\d{20}$/)
    .refine(validIban, 'Ungültige IBAN'),
  bic: z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/),
  numberPrefix: z.string().regex(/^[A-Z0-9-]{0,20}$/),
});
function validIban(value: string) {
  const rearranged = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged)
    for (const digit of /[A-Z]/.test(char)
      ? String(char.charCodeAt(0) - 55)
      : char)
      remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

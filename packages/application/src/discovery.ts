import { z } from 'zod';
/** Literal matching only. Amount recognition never uses floating point or guesses grouping. */
export function searchTerm(raw: unknown) {
  const text = z.string().trim().max(100).parse(raw);
  return {
    text,
    pattern: `%${text.replace(/[\\%_]/g, '\\$&')}%`,
    amount: /^\d{1,12}(?:[.,]\d{1,2})?$/.test(text)
      ? text.replace(',', '.')
      : null,
  };
}

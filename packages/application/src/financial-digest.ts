import { digest } from '@flux/audit';
import type { financialSummaries } from '@flux/db';
/** Notification generation consumes projections, never changes financial facts. */
export function buildFinancialDigest(
  titles: readonly string[],
  summary: typeof financialSummaries.$inferSelect.data,
) {
  const content = { titles: [...titles], count: titles.length, summary };
  return { content, fingerprint: digest(content) };
}

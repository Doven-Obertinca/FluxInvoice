import 'server-only';
import { cookies } from 'next/headers';
import { PLANS, type PlanId } from '@flux/shared';
export const PLAN_COOKIE = 'erechno_plan_choice';
export async function selectedPlan(): Promise<PlanId | null> {
  const value = (await cookies()).get(PLAN_COOKIE)?.value;
  return value && Object.hasOwn(PLANS, value) ? (value as PlanId) : null;
}

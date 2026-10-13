'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from './server';
import { PLAN_COOKIE } from './plan-choice';
export async function choosePlan(value: string) {
  const plan = z.enum(['FREE', 'STARTER', 'BUSINESS', 'PRO']).parse(value);
  (await cookies()).set(PLAN_COOKIE, plan, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.BETTER_AUTH_URL?.startsWith('https:'),
    path: '/',
    maxAge: 86400,
  });
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? '/billing' : '/sign-up');
}

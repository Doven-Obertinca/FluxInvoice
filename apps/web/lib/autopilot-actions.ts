'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { autopilot, principal } from './server';
export async function respondToAction(form: FormData) {
  const p = await principal();
  await autopilot.respond(p, String(form.get('id')), form.get('operation'));
  revalidatePath('/dashboard');
  revalidatePath('/autopilot');
  revalidatePath(`/autopilot/actions/${String(form.get('id'))}`);
}
export async function saveAutopilotPolicy(form: FormData) {
  await autopilot.policy(
    await principal(),
    form.get('mode'),
    form.getAll('rules'),
  );
  revalidatePath('/autopilot');
  redirect('/autopilot');
}
export async function preparePayment(form: FormData) {
  const ticket = await autopilot.preparePayment(
    await principal(),
    String(form.get('id')),
    String(form.get('paidDay')),
  );
  redirect(`/autopilot/actions/${ticket.actionId}?confirmation=${ticket.id}`);
}
export async function confirmPayment(form: FormData) {
  await autopilot.confirmPayment(await principal(), String(form.get('ticket')));
  revalidatePath('/dashboard');
  revalidatePath('/autopilot');
  redirect('/autopilot');
}

export async function saveFinancialTerms(form: FormData) {
  const value = (key: string) => String(form.get(key) ?? '').trim() || null;
  const id = String(form.get('id'));
  await autopilot.saveTerms(await principal(), id, {
    dueDay: value('dueDay'),
    discountDay: value('discountDay'),
    discountRate: value('discountRate'),
    discountBase: value('discountBase'),
  });
  revalidatePath(`/incoming/${id}`);
  revalidatePath('/autopilot');
  redirect(`/incoming/${id}?terms=saved`);
}
export async function prepareDuplicate(form: FormData) {
  const ticket = await autopilot.prepareDuplicate(
    await principal(),
    String(form.get('id')),
    form.get('decision'),
  );
  redirect(`/autopilot/actions/${ticket.actionId}?confirmation=${ticket.id}`);
}
export async function confirmDuplicate(form: FormData) {
  await autopilot.confirmDuplicate(
    await principal(),
    String(form.get('ticket')),
  );
  revalidatePath('/autopilot');
  redirect('/autopilot');
}

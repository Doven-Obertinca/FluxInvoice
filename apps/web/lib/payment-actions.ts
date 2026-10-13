'use server';
import { redirect } from 'next/navigation';
import { AppError } from '@flux/shared';
import { principal } from './server';
import { payments } from './payments';
export async function beginPayment(_: { message: string }, data: FormData) {
  const p = await principal();
  let url: string;
  try {
    const provider = payments();
    if (!provider)
      return {
        message:
          'Die Zahlung ist noch nicht freigeschaltet. Ihre Tarifauswahl bleibt gespeichert.',
      };
    url =
      data.get('operation') === 'portal'
        ? await provider.portal(p)
        : await provider.checkout(p, data.get('plan'));
  } catch (error) {
    return {
      message:
        error instanceof AppError
          ? error.message
          : 'Der Zahlungsvorgang konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.',
    };
  }
  redirect(url);
}

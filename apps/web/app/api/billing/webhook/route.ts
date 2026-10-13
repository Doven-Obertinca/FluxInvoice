import Stripe from 'stripe';
import { payments } from '../../../../lib/payments';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const provider = payments();
  if (!provider) return new Response(null, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response(null, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    await provider.webhook(Buffer.concat(chunks).toString('utf8'), signature);
    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(null, {
      status:
        error instanceof Stripe.errors.StripeSignatureVerificationError ||
        error instanceof SyntaxError
          ? 400
          : 500,
    });
  }
}

import { delivery } from '../../../../../lib/server';
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 16384)
    return new Response(null, { status: 413 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error('BODY');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    await delivery.receipt(
      Buffer.concat(chunks).toString('utf8'),
      request.headers.get('x-delivery-timestamp') ?? '',
      request.headers.get('x-delivery-signature') ?? '',
    );
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}

import { incoming, principal } from '../../../../../../lib/server';
import { AppError } from '@flux/shared';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const p = await principal();
  try {
    const { id } = await params;
    const result = await incoming.download(p, id);
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="incoming-${id}.${result.kind}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    return new Response('Original nicht verfügbar.', {
      status:
        error instanceof AppError && error.code === 'NOT_FOUND' ? 404 : 409,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

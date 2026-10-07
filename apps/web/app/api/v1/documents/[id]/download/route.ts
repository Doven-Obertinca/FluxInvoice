import { principal, einvoice } from '../../../../../../lib/server';
import { AppError } from '@flux/shared';
import { ZodError } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const p = await principal();
  try {
    const { bytes, filename } = await einvoice.download(p, (await params).id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const status =
      error instanceof AppError
        ? error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'AUTHORIZATION'
            ? 403
            : 409
        : error instanceof ZodError
          ? 404
          : 503;
    return Response.json(
      {
        message: 'Das Dokument konnte nicht sicher bereitgestellt werden.',
        requestId: p.requestId,
      },
      { status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { AppError } from '@flux/shared';
import { authorize, can } from '@flux/auth';
import { principal, incoming, db } from '../../../../lib/server';
import { IncomingViewer } from '../../../../components/incoming-viewer';
export default async function IncomingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await principal(),
    role = await authorize(db, p, 'incoming:read');
  const detail = await incoming.detail(p, (await params).id).catch((e) => {
    if (
      e instanceof ZodError ||
      (e instanceof AppError && e.code === 'NOT_FOUND')
    )
      notFound();
    throw e;
  });
  return (
    <IncomingViewer
      key={`${detail.id}-${detail.checks[0]?.id ?? ''}`}
      detail={detail}
      canImport={can(role.role, 'incoming:import')}
      canApprove={can(role.role, 'incoming:approve')}
    />
  );
}

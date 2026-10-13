import type { Metadata } from 'next';
import { Marketing } from '../../components/marketing';
export const metadata: Metadata = {
  title: 'Impressum',
  robots: { index: false, follow: true },
};
export default function Page() {
  const notice = process.env.LEGAL_NOTICE;
  return (
    <Marketing>
      <article className="marketing-section prose">
        <h1>Impressum</h1>
        <div style={{ whiteSpace: 'pre-line' }}>
          {notice ||
            'Die vollständigen Betreiberangaben müssen vor dem öffentlichen Start hinterlegt werden.'}
        </div>
      </article>
    </Marketing>
  );
}

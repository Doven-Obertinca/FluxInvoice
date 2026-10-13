import type { Metadata } from 'next';
import { Marketing } from '../../components/marketing';
export const metadata: Metadata = {
  title: 'Datenschutz',
  robots: { index: false, follow: true },
};
export default function Page() {
  const notice = process.env.PRIVACY_NOTICE;
  return (
    <Marketing>
      <article className="marketing-section prose">
        <h1>Datenschutz</h1>
        <div style={{ whiteSpace: 'pre-line' }}>
          {notice ||
            'Die vollständige Datenschutzerklärung mit Betreiber, eingesetzten Diensten und Aufbewahrungsfristen muss vor dem öffentlichen Start hinterlegt werden.'}
        </div>
      </article>
    </Marketing>
  );
}

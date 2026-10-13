import Link from 'next/link';
import { Marketing, Breadcrumb, StartLink } from '../../components/marketing';
import { publicMetadata } from '../../lib/brand';
export const metadata = publicMetadata(
  'Über ERechno',
  'ERechno verbindet geprüfte XRechnungen mit Autopilot: Rechnungen, Zahlungsfristen und nächste Schritte verständlich an einem Ort.',
  '/ueber',
);
export default function Page() {
  return (
    <Marketing>
      <article className="marketing-section prose">
        <Breadcrumb title={'E-Rechnungen einfach gemacht.'} path="/ueber" />
        <h1>E-Rechnungen einfach gemacht.</h1>
        <p>
          ERechno konzentriert sich auf einen klaren Weg: Angaben erfassen,
          prüfen, bewusst ausstellen und die Originaldatei erhalten.
        </p>
        <h2>Einfach auf der Oberfläche, sorgfältig darunter</h2>
        <p>
          Sie sollen keine XML-Syntax lernen müssen. Die Anwendung führt Sie
          durch den Rechnungsprozess; die technische Prüfung bleibt Teil des
          Ablaufs.
        </p>
        <h2>Mit Autopilot den Überblick behalten</h2>
        <p>
          ERechno begleitet Sie auch nach der Ausstellung. Autopilot zeigt
          überfällige Rechnungen, bekannte Zahlungs- und Skontofristen, mögliche
          Duplikate und offene Prüfungen. Sie sehen den Grund für jeden Hinweis
          und entscheiden bewusst über den nächsten Schritt.
        </p>
        <p>
          <Link href="/funktionen/autopilot">
            ERechno Autopilot kennenlernen →
          </Link>
        </p>
        <h2>Ein nützlicher kostenloser Einstieg</h2>
        <p>
          Drei ausgestellte Rechnungen pro Monat sind kostenlos. Entwürfe
          verbrauchen keinen Platz. Der aktuelle Funktionsumfang und die
          geplanten Tarife stehen transparent auf der Preisseite.
        </p>
        <Link href="/preise">Preise ansehen →</Link>
        <div className="marketing-actions">
          <StartLink />
        </div>
      </article>
    </Marketing>
  );
}

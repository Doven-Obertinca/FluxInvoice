import Link from 'next/link';
import { notFound } from 'next/navigation';
import { principal, service } from '../../../../lib/server';
import { BusinessForm } from '../../../../components/forms';
import { Heading } from '../../../../components/page';
export default async function Settings({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const p = await principal();
  const { section } = await params;
  if (!['company', 'members', 'api', 'integrations'].includes(section))
    notFound();
  const org = await service.company(p);
  const members = section === 'members' ? await service.listMembers(p) : [];
  return (
    <>
      <Heading
        eyebrow="EINSTELLUNGEN"
        title="Ihr Arbeitsbereich."
        description="Die Grundlagen für Ihre Rechnungen."
      />
      <nav className="settings-nav" aria-label="Einstellungen">
        {[
          ['company', 'Unternehmen'],
          ['members', 'Mitglieder'],
          ['api', 'API'],
          ['integrations', 'Integrationen'],
        ].map(([slug, label]) => (
          <Link
            aria-current={section === slug ? 'page' : undefined}
            href={`/settings/${slug}`}
            key={slug}
          >
            {label}
          </Link>
        ))}
      </nav>
      {section === 'company' ? (
        <BusinessForm
          kind="company"
          initial={{
            name: org.name,
            email: org.email,
            line1: org.line1,
            city: org.city,
            postalCode: org.postalCode,
            vatId: org.vatId,
            taxNumber: org.taxNumber,
            contactName: org.contactName,
            contactPhone: org.contactPhone,
            iban: org.iban,
            bic: org.bic,
            numberPrefix: org.numberPrefix,
          }}
        />
      ) : section === 'members' ? (
        <section className="panel">
          <h2>Mitglieder</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Rolle</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.email}</td>
                    <td>
                      <span className="badge">{m.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Einladungen und Rollenverwaltung sind noch nicht freigeschaltet.
          </p>
        </section>
      ) : (
        <section className="panel">
          <p className="eyebrow">GEPLANTE ERWEITERUNG</p>
          <h2>
            {section === 'api' ? 'Programmierschnittstelle' : 'Integrationen'}
          </h2>
          <p className="muted">
            {section === 'api'
              ? 'API-Schlüssel und externe API-Zugriffe werden in einer späteren Phase bereitgestellt.'
              : 'Externe Zustellung und Buchhaltungsintegrationen werden nach der elektronischen Rechnungsvalidierung freigeschaltet.'}
          </p>
        </section>
      )}
    </>
  );
}

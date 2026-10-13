import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { exerciseIncoming } from './incoming-workflow';
import { exerciseImports } from './import-workflow';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
async function review(page: Page, name: string) {
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 834, 1112],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('flux-theme', theme);
      }, theme);
      await page.screenshot({
        path: `test-results/visual/${name}-${device}-${theme}.png`,
        fullPage: true,
      });
      if (device === 'desktop') {
        const accessibility = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          accessibility.violations,
          `${name} ${theme} accessibility`,
        ).toEqual([]);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name} ${device} overflow`,
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    localStorage.setItem('flux-theme', 'light');
  });
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}
import { test, expect } from '@playwright/test';
test('sign up, configure company, create customer, save and validate a mixed-tax invoice', async ({
  page,
}) => {
  test.setTimeout(300000);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/sign-in/);
  await review(page, 'sign-in');
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto('/sign-up');
  await review(page, 'sign-up');
  await page.getByLabel('Ihr Name').fill('Fiktiver Testnutzer');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page
    .getByLabel('Passwort', { exact: true })
    .fill('test-only-StrongPassword-123!');
  await page
    .getByRole('button', { name: 'Konto erstellen', exact: true })
    .click();
  await expect(
    page.getByText(
      'Bitte bestätigen Sie Ihre E-Mail-Adresse über den zugesandten Link.',
    ),
  ).toBeVisible();
  await page.goto('/sign-in');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page
    .getByLabel('Passwort', { exact: true })
    .fill('test-only-StrongPassword-123!');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(/onboarding/);
  await page.goto('/onboarding');
  await expect(
    page.getByRole('heading', { name: 'Bereit für einen klaren Start.' }),
  ).toBeVisible();
  await review(page, 'onboarding');
  await page.getByLabel('Firmenname').fill('Nordlicht Studio GmbH (fiktiv)');
  await page.getByLabel('E-Mail', { exact: true }).fill('studio@example.test');
  await page.getByLabel('Straße und Hausnummer').fill('Musterstraße 12');
  await page.getByLabel('Postleitzahl').fill('20457');
  await page.getByLabel('Ort', { exact: true }).fill('Hamburg');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel('Umsatzsteuer-ID', { exact: true }).fill('DE123456789');
  await page
    .getByLabel('Kontaktperson', { exact: true })
    .fill('Rechnungsservice');
  await page.getByLabel('Telefon', { exact: true }).fill('+49 40 123456');
  await page.getByLabel('Nummernpräfix').fill('NL-');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel('IBAN').fill('DE89370400440532013000');
  await page.getByLabel('BIC').fill('COBADEFFXXX');
  await page.getByRole('button', { name: 'Unternehmen speichern' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await review(page, 'dashboard-empty');
  await page.getByRole('link', { name: 'Kunden', exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(
    page.getByRole('heading', { name: 'Kundenverzeichnis' }),
  ).toBeVisible();
  await review(page, 'customers');
  await page.getByLabel('Firmenname').fill('Kontur Werkstatt GmbH');
  await page.getByLabel('E-Mail', { exact: true }).fill('kontur@example.test');
  await page.getByLabel('Straße und Hausnummer').fill('Beispielweg 7');
  await page.getByLabel('Postleitzahl').fill('10115');
  await page.getByLabel('Ort', { exact: true }).fill('Berlin');
  await page.getByRole('button', { name: 'Kunde speichern' }).click();
  await expect(page).toHaveURL(/customers\/[a-f0-9-]+$/);
  await review(page, 'customer-detail');
  await page.goto('/invoices/new');
  await review(page, 'invoice-new');
  await page.getByRole('tab', { name: 'Prüfung', exact: true }).click();
  await page
    .getByRole('button', { name: 'Wählen Sie einen Kunden aus.' })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Kunde', exact: true }),
  ).toBeFocused();
  await page.getByRole('tab', { name: 'Vorschau', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Kunde', exact: true })
    .selectOption({ label: 'Kontur Werkstatt GmbH' });
  await page
    .getByLabel('Beschreibung', { exact: true })
    .fill('Strategie & Beratung');
  await page.getByLabel('Menge', { exact: true }).fill('2.5');
  await page.getByLabel('Preis netto', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Position hinzufügen' }).click();
  await page
    .getByLabel('Beschreibung', { exact: true })
    .nth(1)
    .fill('Fachbuch');
  await page.getByLabel('Preis netto', { exact: true }).nth(1).fill('50');
  await page
    .getByRole('combobox', { name: 'USt.', exact: true })
    .nth(1)
    .selectOption('7');
  await expect(
    page.getByText('351,00 €', { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel('Kundenreferenz', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  await expect(page).toHaveURL(/invoices\/[a-f0-9-]+$/);
  await page.reload();
  await expect(
    page.getByText('351,00 €', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Prüfung', exact: true }).click();
  await page
    .getByRole('button', { name: 'Gespeicherten Entwurf prüfen' })
    .click();
  await expect(
    page.getByText('Aktion erforderlich', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await review(page, 'invoice-invalid');
  const invalidUrl = page.url();
  await expect(
    page.getByText('Erfragen Sie die Referenz beim Empfänger.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto('/invoices/attention');
  await expect(
    page.getByRole('cell', {
      name: 'E-Rechnungsprüfung fehlgeschlagen',
      exact: true,
    }),
  ).toBeVisible();
  await review(page, 'attention-failed');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .locator('.attention-mobile')
      .getByText('E-Rechnungsprüfung fehlgeschlagen', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('.attention-mobile')
      .getByText('Angaben korrigieren und erneut prüfen →'),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('link', { name: 'Angaben korrigieren und erneut prüfen' })
    .click();
  await expect(page).toHaveURL(invalidUrl);
  await page.getByRole('button', { name: 'Zum Feld', exact: true }).click();
  await expect(
    page.getByLabel('Kundenreferenz', { exact: true }),
  ).toBeFocused();
  await page.getByLabel('Kundenreferenz', { exact: true }).fill('991-12345-06');
  await page
    .getByRole('button', { name: 'Entwurf speichern', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'E-Rechnung prüfen', exact: true })
    .click();
  await expect(
    page.getByText('E-Rechnung bereit', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Kundenreferenz', { exact: true }).fill('991-12345-07');
  await expect(
    page.getByRole('button', { name: 'Finalisieren', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Entwurf speichern', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'E-Rechnung prüfen', exact: true })
    .click();
  await expect(
    page.getByText('E-Rechnung bereit', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await review(page, 'invoice-ready');
  const readyUrl = page.url();
  await page.goto('/invoices/attention');
  await expect(
    page.getByRole('heading', {
      name: 'Kein Handlungsbedarf auf dieser Seite',
    }),
  ).toBeVisible();
  await review(page, 'attention-empty');
  await page.keyboard.press('Control+k');
  await page.getByLabel('Befehl suchen').fill('991-12345-07');
  await expect(
    page.getByRole('button', { name: /Rechnung Entwurf · Kontur/ }),
  ).toBeVisible();
  await review(page, 'workspace-search');
  await page.getByLabel('Befehl suchen').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(readyUrl);
  await page.getByRole('button', { name: 'Finalisieren', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-results/visual/finalize-dialog.png' });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole('button', { name: 'Rechnung finalisieren', exact: true })
    .click();
  await expect(
    page.getByText('Finalisiert · archiviert', { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'XRechnung herunterladen' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^NL-2026-.*\.xml$/);
  await expect(
    page.getByRole('button', { name: 'Entwurf speichern' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Rechnung senden', exact: true })
    .click();
  const composer = page.getByRole('dialog');
  await expect(composer.getByLabel('Empfänger')).toHaveValue(
    'kontur@example.test',
  );
  await expect(composer.getByLabel('Betreff')).toHaveValue(/Rechnung NL-2026/);
  await expect(composer.getByLabel('Nachricht')).toHaveValue(
    /Vielen Dank für die Zusammenarbeit/,
  );
  await expect(composer.getByText(/Finalisierte XRechnung/)).toBeVisible();
  const defaultSubject = await composer.getByLabel('Betreff').inputValue();
  const deliverySubject = defaultSubject + ' · Versandprüfung ' + Date.now();
  await composer.getByLabel('Betreff').fill(deliverySubject);
  await review(page, 'email-composer');
  await composer.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await expect(
    composer.getByText('An: kontur@example.test', { exact: true }),
  ).toBeVisible();
  await composer
    .getByRole('button', { name: 'Rechnung senden', exact: true })
    .click();
  await expect(composer).not.toBeVisible();
  await expect(
    page.getByText('Übermittelt · Zustellung noch nicht bestätigt', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText('E-Mail übermittelt', { exact: false }),
  ).toBeVisible();
  const mailbox = await page.request.get(
    'http://127.0.0.1:8025/api/v1/messages',
  );
  expect(mailbox.ok()).toBe(true);
  const mails = await mailbox.json();
  const delivered = mails.messages.find(
    (m: { To: { Address: string }[]; Subject: string }) =>
      m.To.some((t) => t.Address === 'kontur@example.test') &&
      m.Subject === deliverySubject,
  );
  expect(delivered).toBeTruthy();
  const received = await (
    await page.request.get(
      'http://127.0.0.1:8025/api/v1/message/' + delivered.ID,
    )
  ).json();
  expect(received.Text).toContain('Vielen Dank');
  expect(received.HTML).toContain('Versendet über ERechno');
  expect(received.Attachments).toHaveLength(1);
  expect(received.Attachments[0].FileName).toBe(file.suggestedFilename());
  expect(received.Attachments[0].Checksums.SHA256).toBe(
    createHash('sha256')
      .update(await readFile((await file.path())!))
      .digest('hex'),
  );
  await page
    .getByRole('button', { name: 'Erneut senden', exact: true })
    .click();
  await expect(composer.getByLabel('Betreff')).toHaveValue(defaultSubject);
  await composer
    .getByRole('button', { name: 'Abbrechen', exact: true })
    .click();
  await page.screenshot({
    path: 'test-results/invoice-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/invoice-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await review(page, 'invoice-issued');
  for (const [name, path] of [
    ['dashboard', '/dashboard'],
    ['invoices', '/invoices'],
    ['settings-company', '/settings/company'],
    ['settings-email', '/settings/email'],
    ['settings-members', '/settings/members'],
  ] as const) {
    await page.goto(path);
    await review(page, name);
  }
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Befehl suchen').fill('Rechnungen durchsuchen');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/invoices$/);
  await page.keyboard.press('Control+k');
  await page.getByLabel('Befehl suchen').fill('Kontur');
  await expect(
    page.getByRole('button', { name: /Kunde Kontur/ }),
  ).toBeVisible();
  await page.getByLabel('Befehl suchen').fill('351,00');
  await expect(
    page.getByRole('button', { name: /Rechnung NL-2026/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Kunde Kontur/ })).toHaveCount(
    0,
  );
  await page.getByLabel('Befehl suchen').fill('not-found-%_');
  await expect(
    page.getByRole('status').filter({ hasText: '0 Treffer' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  // A failed read must show a retryable state, not old tenant result data.
  await page.route('**/invoices', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  );
  await page.keyboard.press('Control+k');
  await page.getByLabel('Befehl suchen').fill('Kontur');
  await expect(
    page.getByText('Suche nicht verfügbar. Bitte erneut versuchen.'),
  ).toBeVisible();
  await page.unroute('**/invoices');
  await page.getByLabel('Befehl suchen').fill('Kontur Werkstatt');
  await expect(
    page.getByRole('button', { name: /Kunde Kontur/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await exerciseImports(page);
  const incomingUrl = await exerciseIncoming(page);
  await page.goto(incomingUrl);
  await page.getByLabel('Zahlungsfrist', { exact: true }).fill('2026-10-07');
  await page.getByRole('button', { name: 'Bedingungen bestätigen' }).click();
  await expect(page).toHaveURL(/terms=saved/);
  await page.goto('/autopilot');
  await expect(
    page.getByRole('heading', {
      name: 'Was heute Ihre Aufmerksamkeit braucht',
    }),
  ).toBeVisible();
  await page
    .getByRole('link')
    .filter({
      has: page.getByRole('heading', {
        name: 'Zahlungsfrist einer Lieferantenrechnung überschritten',
      }),
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Zahlungsfrist einer Lieferantenrechnung überschritten',
    }),
  ).toBeVisible();
  await page.getByText('Warum sehe ich diesen Hinweis?').click();
  await expect(
    page.getByText(/Regel PAYABLE_OVERDUE, Version 1/),
  ).toBeVisible();
  await review(page, 'autopilot-action');
  await page.getByLabel('Tatsächlicher Zahlungstag').fill('2026-10-08');
  await page
    .getByRole('button', { name: 'Bestätigung vorbereiten', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Zahlung ausdrücklich bestätigen' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Vollständige Zahlung bestätigen' })
    .click();
  await expect(page).toHaveURL(/autopilot$/);
  await expect(
    page.getByText('Zahlung bestätigt', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Zahlungsfrist einer Lieferantenrechnung überschritten',
    }),
  ).toHaveCount(0);
  await review(page, 'autopilot');
  await page.goto('/autopilot/settings');
  await page.getByLabel('Arbeitsweise').selectOption('AUTOPILOT');
  await page.getByLabel('Eingangsrechnung prüfen', { exact: true }).check();
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click();
  await expect(page).toHaveURL(/\/autopilot$/);
  await page.goto('/autopilot/settings');
  await expect(page.getByLabel('Arbeitsweise')).toHaveValue('AUTOPILOT');
  await review(page, 'autopilot-settings');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/sign-in/);
  await page.goto('/invoices');
  await expect(page).toHaveURL(/sign-in/);
});
test('rejects untrusted origin at the authentication boundary', async ({
  request,
}) => {
  const response = await request.post('/api/auth/sign-up/email', {
    headers: { origin: 'https://attacker.invalid' },
    data: {
      name: 'Attack',
      email: 'attack@example.test',
      password: 'test-only-StrongPassword-123!',
    },
  });
  expect(response.status()).toBe(403);
});

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
  test.setTimeout(180000);
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
  await exerciseImports(page);
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

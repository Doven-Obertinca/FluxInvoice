import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import QRCode from 'qrcode';
import { resolve } from 'node:path';
const fixture = (name: string) =>
  resolve('tests/fixtures/document-import', name);
async function review(page: Page, name: string) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const [device, width, height] of [
      ['desktop', 1440, 1000],
      ['tablet', 834, 1112],
      ['mobile', 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: `test-results/visual/${name}-${device}-${theme}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (device === 'desktop')
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
}
export async function exerciseImports(page: Page) {
  const outgoing: string[] = [];
  const track = (request: import('@playwright/test').Request) => {
    if (
      request.url().startsWith('http') &&
      new URL(request.url()).origin !== 'http://127.0.0.1:3100'
    )
      outgoing.push(request.url());
  };
  page.context().on('request', track);
  await test.step('read PDF, review suggestions, save and officially validate imported invoice', async () => {
    await page
      .getByRole('link', { name: 'Brief / QR-Code lesen', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Brief oder QR-Code lesen' }),
    ).toBeVisible();
    await review(page, 'import-empty');
    await page
      .getByLabel('Foto oder PDF auswählen')
      .setInputFiles(fixture('letter.pdf'));
    await expect(
      page.getByText('2 Positionsvorschläge', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText('AUFTRAG-2026-42', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Im Rechnungseditor prüfen' }),
    ).toBeDisabled();
    await review(page, 'import-pdf');
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Im Rechnungseditor prüfen' })
      .click();
    await expect(
      page.getByLabel('Beschreibung', { exact: true }).first(),
    ).toHaveValue('Beratung');
    await expect(
      page.getByLabel('Preis netto', { exact: true }).first(),
    ).toHaveValue('100');
    await expect(
      page.getByLabel('Kundenreferenz', { exact: true }),
    ).toHaveValue('AUFTRAG-2026-42');
    await expect(
      page.getByText(/Der berechnete Gesamtbetrag stimmt überein/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Entwurf speichern' }).click();
    await expect(page).toHaveURL(/\/invoices\/[a-f0-9-]+$/);
    await expect(
      page.getByText('291,50 €', { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'E-Rechnung prüfen', exact: true })
      .click();
    await expect(
      page.getByText('E-Rechnung bereit', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
  });
  await test.step('real OCR reads photo and scanned PDF locally', async () => {
    for (const name of ['letter.png', 'scanned.pdf']) {
      await page.goto('/invoices/import');
      await page
        .getByLabel('Foto oder PDF auswählen')
        .setInputFiles(fixture(name));
      await expect(
        page.getByText(/Seite gelesen · Texterkennung verwendet/),
      ).toBeVisible({ timeout: 60000 });
      await expect(
        page.getByText('AUFTRAG-2026-42', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('2 Positionsvorschläge', { exact: true }),
      ).toBeVisible();
      if (name === 'letter.png') await review(page, 'import-photo');
    }
  });
  await test.step('QR payment details do not become seller banking or invented net lines', async () => {
    await page.goto('/invoices/import');
    await page.getByRole('radio', { name: 'QR-Code', exact: true }).check();
    const code =
      'BCD\n002\n1\nSCT\n\nFiktiver Lieferant\nDE89370400440532013000\nEUR119.00\n\n\nRG-42';
    const buffer = await QRCode.toBuffer(code, { width: 600, margin: 4 });
    await page
      .getByLabel('Foto oder PDF auswählen')
      .setInputFiles({ name: 'payment.png', mimeType: 'image/png', buffer });
    await expect(
      page.getByText('Fiktiver Lieferant', { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('119,00 €', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Kunde für die neue Rechnung')).toHaveValue(
      '',
    );
    await review(page, 'import-qr');
    await page
      .getByLabel('Kunde für die neue Rechnung')
      .selectOption({ label: 'Kontur Werkstatt GmbH' });
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Im Rechnungseditor prüfen' })
      .click();
    await expect(page.getByLabel('Beschreibung', { exact: true })).toHaveValue(
      '',
    );
    await expect(page.getByLabel('Preis netto', { exact: true })).toHaveValue(
      '0',
    );
    await expect(
      page.getByLabel('Kundenreferenz', { exact: true }),
    ).toHaveValue('');
    await expect(page.getByText(/Der Entwurf weicht davon ab/)).toBeVisible();
  });
  await test.step('decode labelled invoice QR and refuse URL QR without navigation', async () => {
    await page.goto('/invoices/import');
    await page.getByRole('radio', { name: 'QR-Code', exact: true }).check();
    let buffer = await QRCode.toBuffer(
      'Kunde: Kontur Werkstatt GmbH\nKundenreferenz: QR-2026\nBeratung 1 Std. 100,00 EUR netto 19 %',
      { width: 700 },
    );
    await page
      .getByLabel('Foto oder PDF auswählen')
      .setInputFiles({ name: 'invoice-qr.png', mimeType: 'image/png', buffer });
    await expect(page.getByText('QR-2026', { exact: true })).toBeVisible();
    await expect(
      page.getByText('1 Positionsvorschlag', { exact: true }),
    ).toBeVisible();
    buffer = await QRCode.toBuffer('https://attacker.invalid/secret', {
      width: 400,
    });
    await page
      .getByLabel('Foto oder PDF auswählen')
      .setInputFiles({ name: 'link-qr.png', mimeType: 'image/png', buffer });
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'Links werden nicht geöffnet',
    );
    await expect(page).toHaveURL(/\/invoices\/import$/);
    await expect(
      page.getByRole('button', { name: 'Im Rechnungseditor prüfen' }),
    ).toHaveCount(0);
  });
  await test.step('reject invalid, oversized, encrypted and over-limit documents; cancel reading', async () => {
    await page.goto('/invoices/import');
    const input = page.getByLabel('Foto oder PDF auswählen');
    await input.setInputFiles({
      name: 'fake.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('<script>bad</script>'),
    });
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'echte PDF-',
    );
    await input.setInputFiles({
      name: 'large.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    await expect(page.locator('main').getByRole('alert')).toContainText(
      '10 MB',
    );
    await input.setInputFiles(fixture('locked.pdf'));
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'Passwortgeschützte',
    );
    await input.setInputFiles(fixture('too-many-pages.pdf'));
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'höchstens fünf',
    );
    await input.setInputFiles(fixture('scanned.pdf'));
    await page.getByRole('button', { name: 'Lesen abbrechen' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'abgebrochen',
    );
    await expect(
      page.getByRole('heading', { name: '2. Angaben prüfen' }),
    ).toHaveCount(0);
  });
  await test.step('camera denial leaves file scanning available', async () => {
    await page.getByRole('radio', { name: 'QR-Code', exact: true }).check();
    await page.getByRole('button', { name: 'Kamera starten' }).click();
    await expect(
      page.getByText(/Kamera konnte nicht geöffnet werden/),
    ).toBeVisible();
    await expect(page.getByLabel('Foto oder PDF auswählen')).toBeEnabled();
  });
  await test.step('camera decodes real frames and releases video tracks on success', async () => {
    const data = await QRCode.toDataURL(
      'BCD\n002\n1\nSCT\n\nKamera Testempfaenger\nDE89370400440532013000\nEUR25.00',
      { width: 700 },
    );
    await page.evaluate(async (data) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 700;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          const stream = canvas.captureStream(5);
          const redraw = setInterval(
            () => canvas.getContext('2d')!.drawImage(image, 0, 0),
            100,
          );
          for (const track of stream.getTracks()) {
            const original = track.stop.bind(track);
            track.stop = () => {
              clearInterval(redraw);
              original();
              document.documentElement.dataset.cameraStopped = 'true';
            };
          }
          return stream;
        },
      });
    }, data);
    await page.getByRole('button', { name: 'Kamera starten' }).click();
    await expect(
      page.getByText('Kamera Testempfaenger', { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.locator('html')).toHaveAttribute(
      'data-camera-stopped',
      'true',
    );
    await expect(
      page.getByRole('button', { name: 'Kamera stoppen' }),
    ).toHaveCount(0);
  });
  expect(
    outgoing,
    'source documents and recognition must never contact external services',
  ).toEqual([]);
  page.context().off('request', track);
}

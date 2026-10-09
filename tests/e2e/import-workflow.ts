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
async function installCamera(page: Page, data = '', deferred = false) {
  await page.evaluate(
    async ({ data, deferred }) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 700;
      let image: HTMLImageElement | undefined;
      if (data) {
        image = new Image();
        image.src = data;
        await image.decode();
      }
      const draw = () => {
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 700, 700);
        if (image) context.drawImage(image, 0, 0);
      };
      draw();
      document.documentElement.dataset.cameraStopped = 'false';
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          const stream = canvas.captureStream(5);
          const redraw = setInterval(draw, 100);
          for (const track of stream.getTracks()) {
            const original = track.stop.bind(track);
            track.stop = () => {
              clearInterval(redraw);
              original();
              document.documentElement.dataset.cameraStopped = 'true';
            };
          }
          if (deferred)
            await new Promise<void>((resolve) =>
              document.addEventListener(
                'fixture-camera-granted',
                () => resolve(),
                { once: true },
              ),
            );
          return stream;
        },
      });
    },
    { data, deferred },
  );
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
    await expect(
      page.getByRole('link', { name: 'Neue Rechnung', exact: true }),
    ).toHaveClass(/button-primary/);
    await expect(
      page.getByRole('link', { name: 'Aus Dokument erstellen', exact: true }),
    ).toHaveClass(/button-outline/);

    await page
      .getByRole('link', { name: 'Aus Dokument erstellen', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Aus Dokument erstellen' }),
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
      page.getByRole('button', { name: 'Geprüfte Angaben im Editor öffnen' }),
    ).toBeDisabled();
    await review(page, 'import-pdf');
    await page.getByRole('checkbox').check();
    await page.getByText('Erkannter Text / QR-Inhalt', { exact: true }).click();
    const source = await page.getByLabel('Quelltext prüfen').inputValue();
    await page.getByLabel('Quelltext prüfen').fill(source + '\n');
    await expect(
      page.getByRole('button', { name: 'Geprüfte Angaben im Editor öffnen' }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Textkorrekturen auswerten' })
      .click();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Geprüfte Angaben im Editor öffnen' }),
    ).toBeDisabled();
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'Geprüfte Angaben im Editor öffnen' })
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
    await expect(page.getByLabel('Fällig am', { exact: true })).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Entwurf speichern' }),
    ).toBeDisabled();
    const issueDate = await page
      .getByLabel('Rechnungsdatum', { exact: true })
      .inputValue();
    await page.getByLabel('Fällig am', { exact: true }).fill(issueDate);
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
      'BCD\n002\n1\nSCT\n\nFiktiver Lieferant\nDE44500105175407324931\nEUR119.00\n\n\nRG-42';
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
      .getByRole('button', { name: 'Geprüfte Angaben im Editor öffnen' })
      .click();
    await expect(page.getByLabel('Beschreibung', { exact: true })).toHaveValue(
      '',
    );
    await expect(page.getByLabel('Preis netto', { exact: true })).toHaveValue(
      '',
    );
    await expect(
      page.getByLabel('Kundenreferenz', { exact: true }),
    ).toHaveValue('');
    await expect(page.getByText(/Der Entwurf weicht davon ab/)).toBeVisible();
    await expect(page.locator('.paper')).toContainText(
      'DE89370400440532013000',
    );
    await expect(page.locator('.paper')).not.toContainText(
      'DE44500105175407324931',
    );
    await expect(page.getByLabel('Menge', { exact: true })).toHaveValue('');
    await expect(
      page.getByRole('combobox', { name: 'Einheit', exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByRole('combobox', { name: 'USt.', exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByLabel('Leistungsdatum', { exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Entwurf speichern' }),
    ).toBeDisabled();
    await page.getByRole('tab', { name: 'Prüfung', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Wählen Sie den zutreffenden Umsatzsteuersatz aus.',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'USt.', exact: true }),
    ).toBeFocused();
    await page
      .getByRole('button', {
        name: 'Wählen Sie die Einheit für diese Leistung aus.',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Einheit', exact: true }),
    ).toBeFocused();
    await review(page, 'import-incomplete');
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
      page.getByRole('button', { name: 'Geprüfte Angaben im Editor öffnen' }),
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
    await installCamera(page, data);
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
  await test.step('camera releases tracks on stop, page hiding, navigation and late permission', async () => {
    for (const action of ['stop', 'hidden', 'navigate', 'late-grant']) {
      await page.goto('/invoices/import');
      await page.getByRole('radio', { name: 'QR-Code', exact: true }).check();
      await installCamera(page, '', action === 'late-grant');
      await page.getByRole('button', { name: 'Kamera starten' }).click();
      if (action !== 'late-grant')
        await expect(
          page.getByText('Halten Sie einen QR-Code ruhig in die Kamera.'),
        ).toBeVisible();
      if (action === 'navigate') {
        await page
          .getByRole('link', { name: '← Rechnungen', exact: true })
          .click();
        await expect(page).toHaveURL(/\/invoices$/);
      } else if (action === 'hidden') {
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: true,
          });
          document.dispatchEvent(new Event('visibilitychange'));
          Reflect.deleteProperty(document, 'hidden');
        });
      } else {
        await page.getByRole('button', { name: 'Kamera stoppen' }).click();
        if (action === 'late-grant')
          await page.evaluate(() =>
            document.dispatchEvent(new Event('fixture-camera-granted')),
          );
      }
      await expect(page.locator('html')).toHaveAttribute(
        'data-camera-stopped',
        'true',
      );
      await expect(
        page.getByRole('button', { name: 'Kamera stoppen' }),
      ).toHaveCount(0);
    }
  });
  await test.step('cancelling OCR initialization releases the worker and permits a fresh read', async () => {
    await page.goto('/invoices/import');
    const active = new Set<import('@playwright/test').Worker>();
    const onWorker = (worker: import('@playwright/test').Worker) => {
      if (worker.url().includes('/reader/ocr/')) {
        active.add(worker);
        worker.on('close', () => active.delete(worker));
      }
    };
    page.on('worker', onWorker);
    let release = () => {};
    let requested = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pattern = '**/reader/ocr/deu.traineddata.gz';
    await page.route(pattern, async (route) => {
      requested = true;
      await gate;
      await route.continue();
    });
    try {
      await page
        .getByLabel('Foto oder PDF auswählen')
        .setInputFiles(fixture('letter.png'));
      await expect.poll(() => requested, { timeout: 10000 }).toBe(true);
      await page.getByRole('button', { name: 'Lesen abbrechen' }).click();
      await expect(page.locator('main').getByRole('alert')).toContainText(
        'abgebrochen',
      );
      release();
      await expect.poll(() => active.size, { timeout: 10000 }).toBe(0);
      await expect(
        page.getByRole('heading', { name: '2. Angaben prüfen' }),
      ).toHaveCount(0);
    } finally {
      release();
      await page.unroute(pattern);
      page.off('worker', onWorker);
    }
    await page
      .getByLabel('Foto oder PDF auswählen')
      .setInputFiles(fixture('letter.png'));
    await expect(
      page.getByText('2 Positionsvorschläge', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
  });
  expect(
    outgoing,
    'source documents and recognition must never contact external services',
  ).toEqual([]);
  page.context().off('request', track);
}

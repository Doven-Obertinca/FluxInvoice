import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
async function review(page: Page, name: string) {
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.screenshot({
        path: `test-results/visual/${name}-${device}-${theme}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
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
}
export async function exerciseIncoming(page: Page) {
  const xml = await readFile(
    'packages/einvoice/fixtures/golden/3.0.2/standard19.xml',
  );
  await page.goto('/incoming');
  await expect(
    page.getByRole('heading', { name: 'Eingangsrechnungen', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Eingangsdatei').setInputFiles({
    name: 'original.xml',
    mimeType: 'application/xml',
    buffer: xml,
  });
  await page
    .getByRole('button', { name: 'Original importieren', exact: true })
    .click();
  await expect(page).toHaveURL(/incoming\/[a-f0-9-]+$/);
  const originalUrl = page.url();
  await expect(
    page.getByText('XML-Prüfung bestanden', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole('button', { name: 'Geschäftlich freigeben' }),
  ).toBeDisabled();
  await review(page, 'incoming-viewer');
  await page
    .getByRole('tab', { name: 'Strukturierte Daten', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Strukturierte Daten', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Original', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Original herunterladen' }).click();
  const file = await downloaded;
  expect(await readFile((await file.path())!)).toEqual(xml);
  await page.getByRole('button', { name: 'Original erneut prüfen' }).click();
  await expect(
    page.getByText('Prüfung ausstehend', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('XML-Prüfung bestanden', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Geschäftlich freigeben' }).click();
  await expect(page.getByText('Freigegeben', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Geschäftlich freigeben' }),
  ).toHaveCount(0);
  await page.goto('/incoming');
  await review(page, 'incoming-inbox');
  // Drag/drop is equivalent to the accessible file input, never automatic approval.
  const invalid = xml
    .toString()
    .replace(/<cbc:BuyerReference>.*?<\/cbc:BuyerReference>/, '');
  await page
    .getByRole('region', { name: 'Eingangsrechnung importieren' })
    .evaluate((el, content) => {
      const data = new DataTransfer();
      data.items.add(
        new File([content], 'missing-reference.xml', {
          type: 'application/xml',
        }),
      );
      el.dispatchEvent(
        new DragEvent('drop', { bubbles: true, dataTransfer: data }),
      );
    }, invalid);
  await page
    .getByRole('button', { name: 'Original importieren', exact: true })
    .click();
  await expect(
    page.getByText('Korrektur erforderlich', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole('tab', { name: 'Prüfung', exact: true }).click();
  await expect(
    page.getByText('Eine fremde Rechnung korrigiert der Aussteller.', {
      exact: false,
    }),
  ).toBeVisible();
  await review(page, 'incoming-invalid');
  await page
    .getByRole('button', { name: 'Betroffene Angabe anzeigen' })
    .first()
    .click();
  await expect(page.locator('#incoming-reference')).toBeFocused();
  await page.getByRole('checkbox').check();
  await expect(
    page.getByRole('button', { name: 'Geschäftlich freigeben' }),
  ).toBeDisabled();
  await page.goto('/incoming?problems=1');
  await expect(
    page.getByRole('heading', { name: 'Prüfbedarf im Eingang' }),
  ).toBeVisible();
  await page
    .getByLabel('Eingangsdatei')
    .setInputFiles('tests/fixtures/incoming/hybrid.pdf');
  await page
    .getByRole('button', { name: 'Original importieren', exact: true })
    .click();
  await expect(
    page.getByText('XML-Prüfung bestanden', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText('Die Rechnungsansicht verwendet eingebettete XML-Daten.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto('/incoming');
  await page.getByLabel('Eingangsdatei').setInputFiles({
    name: 'oversized.xml',
    mimeType: 'application/xml',
    buffer: Buffer.alloc(2097153),
  });
  await expect(page.getByText('Die Datei überschreitet 2 MiB.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Original importieren', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Eingangsdatei').setInputFiles({
    name: 'broken.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from('<broken>'),
  });
  await page
    .getByRole('button', { name: 'Original importieren', exact: true })
    .click();
  await expect(
    page.getByText('Die Datei lässt sich nicht eindeutig und sicher', {
      exact: false,
    }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole('checkbox').check();
  await expect(
    page.getByRole('button', { name: 'Geschäftlich freigeben' }),
  ).toBeDisabled();
  return originalUrl;
}

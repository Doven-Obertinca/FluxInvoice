import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('public pages are useful on mobile, private pages stay noindex, and XML stays local', async ({
  page,
  request,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/',
      '/preise',
      '/xrechnung',
      '/funktionen/autopilot',
      '/hilfe/autopilot',
      '/kostenlos/xrechnung-anzeigen',
    ]) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(await page.title()).toContain('ERechno');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    }
    await page.goto('/');
    await page.screenshot({
      path: `test-results/erechno-home-${width}.png`,
      fullPage: true,
    });
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'E-Rechnungkostenlos erstellen',
  );
  await page.goto('/kostenlos/xrechnung-anzeigen');
  const transmitted: string[] = [];
  page.on('request', (r) => {
    if (r.postData()) transmitted.push(r.postData()!);
  });
  await page
    .locator('#xml-file')
    .setInputFiles('packages/einvoice/fixtures/golden/3.0.2/standard19.xml');
  await expect(
    page.getByRole('heading', { name: 'Rechnungsdaten (UBL)' }),
  ).toBeVisible();
  expect(transmitted).toEqual([]);
  await page.getByRole('button', { name: 'Anzeige löschen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Rechnungsdaten (UBL)' }),
  ).toHaveCount(0);
  await page.locator('#xml-file').setInputFiles({
    name: 'unsafe.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from('<!DOCTYPE Invoice [<!ENTITY x "unsafe">]><Invoice/>'),
  });
  await expect(
    page.getByRole('region', { name: 'Lokaler XML-Viewer' }).getByRole('alert'),
  ).toContainText('Entitätsdefinitionen');
  for (const path of [
    '/sign-in',
    '/dashboard',
    '/api/v1/documents/00000000-0000-0000-0000-000000000000/download',
  ]) {
    const response = await request.get(path);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).not.toMatch(
    /dashboard|invoices|customers|incoming|settings|billing|sign-in/,
  );
});

test('Autopilot promotion, help and SEO connect public discovery to private operations', async ({
  page,
  request,
}) => {
  await page.goto('/funktionen/autopilot');
  await expect(page).toHaveTitle(/Rechnungen und Zahlungsfristen.*ERechno/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Skontofristen und Duplikate/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/funktionen\/autopilot$/,
  );
  await expect(
    page.getByRole('heading', {
      name: 'Sie bestimmen, was ERechno vorbereitet.',
    }),
  ).toBeVisible();
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/funktionen\/autopilot\/opengraph-image/,
  );
  const imageResponse = await request.get(
    '/funktionen/autopilot/opengraph-image',
  );
  expect(imageResponse.status()).toBe(200);
  expect(imageResponse.headers()['content-type']).toContain('image/png');
  const schema = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const records = schema.map((text) => JSON.parse(text));
  expect(
    records.some(
      (r) =>
        r['@type'] === 'WebPage' &&
        r.about.featureList.includes('Ihr Morning Brief'),
    ),
  ).toBe(true);
  await page
    .getByRole('link', { name: 'Anleitung ansehen', exact: true })
    .click();
  await expect(page).toHaveURL(/\/hilfe\/autopilot$/);
  await expect(
    page.getByRole('heading', {
      name: '3. Eine vollständige Zahlung bestätigen',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '7. Ihre Arbeitsweise einstellen' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Autopilot öffnen', exact: true }),
  ).toHaveAttribute('href', '/autopilot');
  await page.goto('/preise');
  await expect(
    page.getByText(
      'Autopilot: Rechnungen, Fristen und nächste Schritte im Blick',
      { exact: true },
    ),
  ).toHaveCount(4);
  const privateResponse = await request.get('/autopilot');
  expect(privateResponse.headers()['x-robots-tag']).toContain('noindex');
  await page.goto('/hilfe');
  await expect(
    page.getByRole('link', { name: 'Autopilot Schritt für Schritt lernen' }),
  ).toHaveAttribute('href', '/hilfe/autopilot');
});

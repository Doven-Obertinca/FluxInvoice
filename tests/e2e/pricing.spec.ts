import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('pricing buttons align and every plan choice survives the registration flow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/preise');
  const buttons = page.locator('.plan-card-bottom button');
  await expect(buttons).toHaveCount(4);
  const boxes = await buttons.evaluateAll((nodes) =>
    nodes.map((node) => ({
      top: node.getBoundingClientRect().top,
      height: node.getBoundingClientRect().height,
    })),
  );
  expect(
    Math.max(...boxes.map((b) => b.top)) - Math.min(...boxes.map((b) => b.top)),
  ).toBeLessThanOrEqual(2);
  expect(boxes.every((b) => b.height >= 44)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: 'test-results/erechno-pricing-desktop.png',
    fullPage: true,
  });
  for (const name of ['Starter', 'Business', 'Pro']) {
    await page.goto('/preise');
    await page
      .getByRole('button', { name: `${name} wählen`, exact: true })
      .click();
    await expect(page).toHaveURL(/sign-up$/);
    await expect(
      page.getByText(`Gewählter Tarif: ${name} · Zahlung nach der Einrichtung`),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Zur Anmeldung' }).click();
    await expect(
      page.getByText(`Gewählter Tarif: ${name} · Zahlung nach der Einrichtung`),
    ).toBeVisible();
  }
  await page.goto('/preise');
  await page
    .getByRole('button', { name: 'Kostenlos starten', exact: true })
    .click();
  await expect(
    page.getByText('Gewählter Tarif: Free · kostenlos'),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/preise');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: 'test-results/erechno-pricing-mobile.png',
    fullPage: true,
  });
});

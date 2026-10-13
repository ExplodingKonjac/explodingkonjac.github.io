import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`math scripts scale below the main text at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://uapis.cn/**', (route) => route.abort());
    await page.goto('/blog/posts/basic-programming-2026-special/');
    await page.locator('details.environment').evaluateAll((elements) => {
      for (const element of elements) element.open = true;
    });
    await page.evaluate(() => document.fonts.ready);

    const inline = page.locator('.katex').filter({
      has: page.locator('annotation', { hasText: /^x_1, y_1$/ }),
    });
    const display = page.locator('.katex-display .katex').filter({
      has: page.locator('annotation', { hasText: /\\sum/ }),
    });
    for (const [formula, text] of [
      [inline, '1'],
      [display, 'k'],
      [display, '64'],
    ]) {
      await expect(formula).toHaveCount(1);
      const script = formula
        .locator('.katex-html .msupsub .mord')
        .filter({
          hasText: new RegExp(`^${text}$`),
        })
        .first();
      await expect(script).toBeVisible();
      const ratio = await script.evaluate((element) => {
        const fontSize = (node) => parseFloat(getComputedStyle(node).fontSize);
        return fontSize(element) / fontSize(element.closest('.katex'));
      });
      // TeX's first script level is 70% of the formula's base size.
      expect(ratio).toBeCloseTo(0.7, 2);
    }
  });
}

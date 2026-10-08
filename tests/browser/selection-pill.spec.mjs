import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://uapis.cn/**', (route) => route.abort());
});

async function aligned(pill, item) {
  await expect
    .poll(async () => {
      const a = await pill.boundingBox(),
        b = await item.boundingBox();
      return Math.max(
        ...['x', 'y', 'width', 'height'].map((key) =>
          Math.abs(a[key] - b[key]),
        ),
      );
    })
    .toBeLessThan(0.3);
}

for (const width of [390, 1440]) {
  test(`one navbar pill slides continuously and returns to the active item at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date('2026-10-08T10:00:00Z') });
    await page.goto('/blog/');
    const nav = page.locator('[data-pill-group]');
    const pill = nav.locator('.selection-pill');
    const blog = nav.getByRole('link', { name: 'Blog', exact: true });
    const tags = nav.getByRole('link', { name: 'Tags', exact: true });
    const search = nav.getByRole('link', { name: 'Search', exact: true });
    await expect(pill).toHaveCount(1);
    await aligned(pill, blog);
    await page.clock.pauseAt(new Date('2026-10-08T10:01:00Z'));
    await tags.hover();
    const before = await pill.boundingBox();
    await page.clock.runFor(80);
    const middle = await pill.boundingBox();
    expect(middle.x).toBeGreaterThan(before.x + 5);
    expect(middle.x).toBeLessThan((await tags.boundingBox()).x - 2);
    await expect(pill).toBeVisible();
    await expect(blog).toHaveAttribute('aria-current', 'page');
    await expect(tags).not.toHaveAttribute('aria-current');
    const linkMaterials = await nav.locator('a').evaluateAll((links) =>
      links.map((link) => {
        const style = getComputedStyle(link);
        return [style.backgroundColor, style.backgroundImage, style.boxShadow];
      }),
    );
    expect(linkMaterials).toEqual(
      Array(3).fill(['rgba(0, 0, 0, 0)', 'none', 'none']),
    );
    await search.hover();
    expect(Math.abs((await pill.boundingBox()).x - middle.x)).toBeLessThan(1);
    await page.clock.runFor(80);
    const further = await pill.boundingBox();
    expect(further.x).toBeGreaterThan(middle.x);
    await blog.hover();
    expect(Math.abs((await pill.boundingBox()).x - further.x)).toBeLessThan(1);
    await page.clock.runFor(320);
    await aligned(pill, blog);
    await tags.hover();
    await page.clock.runFor(320);
    await aligned(pill, tags);
    await page.mouse.move(1, 300);
    await page.clock.runFor(80);
    const returning = await pill.boundingBox();
    expect(returning.x).toBeGreaterThan((await blog.boundingBox()).x + 2);
    expect(returning.x).toBeLessThan((await tags.boundingBox()).x - 2);
    await page.clock.runFor(240);
    await aligned(pill, blog);
    await expect(pill).toHaveCount(1);
  });
}

test('navbar pill follows keyboard focus and persists through navigation and history', async ({
  page,
}) => {
  await page.goto('/blog/');
  const pill = page.locator('.selection-pill');
  const blog = page.locator('[data-nav="blog"]');
  const tags = page.locator('[data-nav="tags"]');
  await page.evaluate(() => {
    window.initialPill = document.querySelector('.selection-pill');
  });
  await blog.focus();
  await page.keyboard.press('Tab');
  await expect(tags).toBeFocused();
  await aligned(pill, tags);
  await expect(blog).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/blog/tags/');
  await expect(page.locator('h1')).toBeFocused();
  await aligned(pill, tags);
  await expect(tags).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL('/blog/');
  await expect(blog).toHaveAttribute('aria-current', 'page');
  await aligned(pill, blog);
  expect(
    await page.evaluate(
      () => window.initialPill === document.querySelector('.selection-pill'),
    ),
  ).toBe(true);
  await expect(pill).toHaveCount(1);
  await tags.focus();
  await aligned(pill, tags);
  await page.locator('.theme-toggle').focus();
  await aligned(pill, blog);
});

test('navbar pill stays aligned as the mobile navbar docks and changes width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/blog/posts/welcome/');
  const pill = page.locator('.selection-pill');
  const blog = page.locator('[data-nav="blog"]');
  for (const top of [0, 30, 60, 90, 140, 0]) {
    await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), top);
    await aligned(pill, blog);
  }
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await aligned(pill, blog);
  }
});

test('navbar pill respects reduced motion, touch selection and high contrast', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/blog/');
  const pill = page.locator('.selection-pill');
  const blog = page.locator('[data-nav="blog"]');
  const tags = page.locator('[data-nav="tags"]');
  await tags.hover();
  const current = await pill.boundingBox(),
    destination = await tags.boundingBox();
  expect(Math.abs(current.x - destination.x)).toBeLessThan(0.3);
  await page.mouse.move(1, 300);
  await tags.dispatchEvent('pointerover', { pointerType: 'touch' });
  await aligned(pill, blog);
  await tags.dispatchEvent('click');
  await expect(page).toHaveURL('/blog/tags/');
  await aligned(pill, tags);
  await page.emulateMedia({ contrast: 'more' });
  // Firefox's emulated preference updates matchMedia immediately but only
  // restyles existing stylesheets on reload. Test the actual preferred rendering.
  await page.reload();
  await expect(pill).toHaveCSS('backdrop-filter', 'none');
  await expect(pill).toBeVisible();
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(pill).toBeVisible();
});

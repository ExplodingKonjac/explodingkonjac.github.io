import { test, expect, type Page } from '@playwright/test';
const settle = (page: Page) =>
  expect(page.locator('html')).not.toHaveAttribute('data-motion', /.+/);
test.beforeEach(async ({ page }) => {
  await page.route('https://uapis.cn/**', (route) => route.abort());
});

test('navbar has Blog, Tags and Search, with a separate new-tab GitHub button', async ({
  page,
  context,
}) => {
  await page.goto('/blog/');
  const group = page.locator('[data-pill-group]');
  await expect(group.locator('a')).toHaveText(['Blog', 'Tags', 'Search']);
  await expect(
    group.locator('.github-link, .language-toggle, .theme-toggle'),
  ).toHaveCount(0);
  await expect(page.locator('.header-tools .icon-button')).toHaveCount(3);
  const github = page.getByRole('link', {
    name: 'GitHub (opens in a new tab)',
  });
  await expect(github).toHaveAttribute('target', '_blank');
  await expect(github).toHaveAttribute('rel', /noopener/);
  await context.route('https://github.com/ExplodingKonjac', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>GitHub</title>' }),
  );
  const opened = context.waitForEvent('page');
  await github.click();
  const popup = await opened;
  await expect(popup).toHaveURL('https://github.com/ExplodingKonjac');
  await popup.close();
  await expect(page).toHaveURL('/blog/');
  await expect(page.locator('link[rel="alternate"]')).toHaveAttribute(
    'href',
    '/blog/rss.xml',
  );
});

for (const [locale, expected] of [
  ['zh-CN', 'zh-CN'],
  ['zh-TW', 'zh-CN'],
  ['en-GB', 'en'],
  ['fr-FR', 'en'],
]) {
  test(`interface defaults from system locale ${locale}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.route('https://uapis.cn/**', (route) => route.abort());
    await page.goto('/blog/');
    await expect(page.locator('html')).toHaveAttribute('lang', expected);
    await expect(page.locator('[data-nav="search"]')).toHaveText(
      expected === 'en' ? 'Search' : '搜索',
    );
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-locale-pending',
    );
    await context.close();
  });
}

test('language switch works in memory with blocked storage', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Blocked');
    };
  });
  await page.goto('/blog/');
  await page.locator('.language-toggle').click();
  await page.locator('[data-nav="search"]').click();
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('[data-nav="search"]')).toHaveText('搜索');
  await page.locator('.language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('language follows system changes until chosen and can change during card motion', async ({
  page,
}) => {
  await page.goto('/blog/');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'zh-CN',
    });
    window.dispatchEvent(new Event('languagechange'));
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.locator('.language-toggle').click();
  await page.evaluate(() => window.dispatchEvent(new Event('languagechange')));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('[data-nav="tags"]').click();
  await expect(page).toHaveURL('/blog/tags/');
  await page.locator('.language-toggle').click();
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('h1')).toHaveText('标签');
  await expect(page.locator('.page-stage [inert], .glass-flight')).toHaveCount(
    0,
  );
});

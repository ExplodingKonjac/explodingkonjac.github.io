import { test, expect, type Page } from '@playwright/test';

const post = '/blog/posts/welcome/';
const search = '/blog/search/';
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

test('search index includes rendered body text and excludes drafts', async ({
  request,
}) => {
  const response = await request.get('/blog/search-index.json');
  expect(response.ok()).toBe(true);
  const entries = await response.json();
  expect(entries.map((entry: { id: string }) => entry.id)).toEqual(['welcome']);
  expect(entries[0].content).toContain('hypotenuse');
  expect(entries[0].content).toContain('eventually terminates');
  expect(entries[0].content).not.toContain('<h2');
  expect(entries[0].content).not.toContain('class="');
});

test('search matches titles, summaries and contents, restores the query on Back and refresh', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/search-index.json')) requests++;
  });
  await page.goto(search);
  await expect(page.locator('[data-nav="search"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  const input = page.getByRole('searchbox');
  for (const query of ['A notebook for ideas', 'writing tools', 'HYPOTENUSE']) {
    await input.fill(query);
    await expect(page.locator('.post-card:visible')).toHaveCount(1);
    await expect(page.locator('[data-search-status]')).toHaveText(
      '1 post found',
    );
  }
  await expect(page.locator('.search-excerpt')).toContainText('hypotenuse');
  await expect(page).toHaveURL(/q=HYPOTENUSE/);
  await page.locator('.post-link').click();
  await expect(page).toHaveURL(post);
  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(/search\/\?q=HYPOTENUSE/);
  await settle(page);
  await expect(input).toHaveValue('HYPOTENUSE');
  await expect(page.locator('.post-card:visible')).toHaveCount(1);
  expect(requests).toBe(1);
  await page.reload();
  await expect(input).toHaveValue('HYPOTENUSE');
  await expect(page.locator('.post-card:visible')).toHaveCount(1);
  await input.fill('<img src=x onerror=alert(1)>');
  await expect(page.locator('[data-search-status]')).toHaveText(
    'No posts found. Try different words.',
  );
  await expect(page.locator('[data-search-results] img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(input).toHaveValue('');
  await expect(page).toHaveURL(search);
  await expect(input).toBeFocused();
  expect(errors).toEqual([]);
});

test('search waits for IME composition and can retry a failed index request', async ({
  page,
}) => {
  await page.route('**/search-index.json', (route) => route.abort());
  await page.goto(search);
  const input = page.getByRole('searchbox');
  await input.focus();
  await input.dispatchEvent('compositionstart');
  await input.evaluate((node: HTMLInputElement) => {
    node.value = 'hypotenuse';
    node.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        isComposing: true,
        inputType: 'insertCompositionText',
        data: 'hypotenuse',
      }),
    );
  });
  await expect(page.locator('[data-search-status]')).toHaveText(
    'Type a word or phrase to find a post.',
  );
  await input.dispatchEvent('compositionend');
  await expect(page.locator('[data-search-status]')).toHaveText(
    'Search could not load. Try again.',
  );
  await page.unroute('**/search-index.json');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.post-card:visible')).toHaveCount(1);
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

test('language choice persists without translating authored post text or tag names', async ({
  page,
}) => {
  await page.goto(post);
  const body = await page.locator('.prose').innerText();
  const title = await page.locator('[data-post-title]').innerText();
  await page.locator('.language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.toc-desktop h2')).toHaveText('本页目录');
  await expect(page.locator('.theme-toggle')).toHaveAttribute(
    'aria-label',
    '切换到深色模式',
  );
  await expect(page.locator('[data-post-title]')).toHaveText(title);
  expect(await page.locator('.prose').innerText()).toBe(body);
  await expect(page.locator('.article-heading .tags a')).toHaveText([
    'mathematics',
    'algorithms',
    'technology',
  ]);
  await page.locator('[data-nav="tags"]').click();
  await settle(page);
  await expect(page.locator('h1')).toHaveText('标签');
  await page.locator('[data-nav="search"]').click();
  await settle(page);
  await expect(page.getByRole('searchbox')).toHaveAttribute(
    'placeholder',
    '输入关键词…',
  );
  await page.getByRole('searchbox').fill('hypotenuse');
  await expect(page.locator('[data-search-status]')).toHaveText(
    '找到 1 篇文章',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveTitle(/搜索/);
  await page.locator('.language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-search-status]')).toHaveText('1 post found');
});

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

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`navbar controls stay distinct in both languages while docking at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(post);
    for (const language of ['en', 'zh-CN']) {
      if (language === 'zh-CN') await page.locator('.language-toggle').click();
      for (const top of [0, 60, 140]) {
        await page.evaluate(
          (top) => scrollTo({ top, behavior: 'instant' }),
          top,
        );
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const boxes = await page
          .locator('.site-header nav a, .header-tools .icon-button, .wordmark')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect().toJSON()),
          );
        for (let i = 0; i < boxes.length; i++) {
          expect(boxes[i].width).toBeGreaterThanOrEqual(44);
          expect(boxes[i].x).toBeGreaterThanOrEqual(0);
          expect(boxes[i].right).toBeLessThanOrEqual(width);
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j];
            const intersection =
              Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
              Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
            expect(intersection).toBeLessThan(1);
          }
        }
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
      }
    }
  });
}

test('search page retains browsing and GitHub without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.route('https://uapis.cn/**', (route) => route.abort());
  await page.goto(search);
  await expect(page.locator('.post-link')).toBeVisible();
  await expect(page.locator('.github-link')).toBeVisible();
  await expect(page.locator('.language-toggle')).toBeHidden();
  await expect(page.locator('.search-form')).toBeHidden();
  await context.close();
});

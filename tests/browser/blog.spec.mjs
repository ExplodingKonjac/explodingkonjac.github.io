import { test, expect } from '@playwright/test';
import { load } from 'cheerio';

const post = '/blog/posts/welcome/';
const themeKey = 'blog-appearance-theme';
const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#b4c4f0"/></svg>';

async function settled(page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-motion', /.+/);
}
async function configureBackground(page, source) {
  await page.route('**/blog/', async (route) => {
    const response = await route.fetch();
    const $ = load(await response.text());
    $('[data-background]').attr(
      'data-background',
      JSON.stringify({ source, position: '50% 50%' }),
    );
    await route.fulfill({ response, body: $.html() });
  });
}

test('static routes, history, shell continuity and keyboard focus', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/blog/');
  await page.evaluate(() => {
    window.originalWallpaper = document.querySelector('.wallpaper');
    window.originalHeader = document.querySelector('.site-header');
  });
  await page.locator('.post-link').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(post);
  await settled(page);
  await expect(page.locator('h1')).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        window.originalWallpaper === document.querySelector('.wallpaper') &&
        window.originalHeader === document.querySelector('.site-header'),
    ),
  ).toBe(true);
  await expect(page.locator('.katex-display')).toHaveCount(2);
  await expect(page.locator('.environment-theorem')).toBeVisible();
  await expect(page.locator('.astro-code')).toHaveCount(1);
  await expect(page.locator('.prose table')).toHaveCount(1);
  await expect(page.locator('.prose figure img')).toHaveAttribute(
    'src',
    /triangle/,
  );
  await expect(page.locator('.footnotes')).toHaveCount(1);
  await page.goBack();
  await settled(page);
  await expect(page).toHaveURL('/blog/');
  await expect(page.locator('.post-link')).toBeFocused();
  await page.locator('[data-nav="tags"]').click();
  await settled(page);
  await expect(page.locator('[data-nav="tags"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.locator('.tag-index a').filter({ hasText: 'mathematics' }).click();
  await settled(page);
  await expect(page.locator('h1')).toContainText('mathematics');
  await page.locator('.post-link').click();
  await settled(page);
  await page.goBack();
  await settled(page);
  await expect(page).toHaveURL('/blog/tags/mathematics/');
  await page.reload();
  await expect(page.locator('.post-link')).toBeVisible();
  expect(errors).toEqual([]);
});

test('theme follows the system until explicitly chosen and survives navigation', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/blog/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), themeKey),
  ).toBe('light');
  await page.locator('.post-link').click();
  await settled(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const lightCode = await page
    .locator('.astro-code span[style]')
    .first()
    .evaluate((node) => getComputedStyle(node).color);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#141d30',
  );
  const darkCode = await page
    .locator('.astro-code span[style]')
    .first()
    .evaluate((node) => getComputedStyle(node).color);
  expect(darkCode).not.toBe(lightCode);
});

test('theme works when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/blog/');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.locator('.post-link').click();
  await settled(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('JSON background resolves once and remains the same element across pages', async ({
  page,
}) => {
  let requests = 0;
  await configureBackground(page, {
    kind: 'json',
    url: 'https://wallpaper.test/api',
    imagePath: 'data.0.url',
  });
  await page.route('https://wallpaper.test/api', (route) => {
    requests++;
    return route.fulfill({
      json: { data: [{ url: '/image.svg' }] },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.route('https://wallpaper.test/image.svg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: image }),
  );
  await page.goto('/blog/');
  await expect(page.locator('.wallpaper')).toHaveAttribute(
    'data-state',
    'ready',
  );
  await expect(page.locator('.wallpaper-image')).toHaveClass(/is-loaded/);
  await page.evaluate(() => {
    window.wallpaperImage = document.querySelector('.wallpaper-image');
  });
  await page.locator('.post-link').click();
  await settled(page);
  await page.goBack();
  await settled(page);
  expect(requests).toBe(1);
  expect(
    await page.evaluate(
      () =>
        window.wallpaperImage === document.querySelector('.wallpaper-image'),
    ),
  ).toBe(true);
});

test('direct image background decodes before reveal', async ({ page }) => {
  await configureBackground(page, {
    kind: 'image',
    url: 'https://wallpaper.test/image.svg',
  });
  await page.route('https://wallpaper.test/image.svg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: image }),
  );
  await page.goto('/blog/');
  await expect(page.locator('.wallpaper-image')).toHaveClass(/is-loaded/);
  expect(
    await page
      .locator('.wallpaper-image')
      .evaluate((node) => node.naturalWidth),
  ).toBe(800);
});

for (const failure of [
  'missing field',
  'invalid JSON',
  'network',
  'CORS',
  'decode',
  'timeout',
]) {
  test(`background falls back after ${failure}`, async ({ page }) => {
    await configureBackground(page, {
      kind: 'json',
      url: 'https://wallpaper.test/api',
      imagePath: 'data.url',
    });
    await page.route('https://wallpaper.test/api', async (route) => {
      if (failure === 'network') return route.abort();
      if (failure === 'CORS')
        return route.fulfill({
          json: { data: { url: 'https://wallpaper.test/valid.svg' } },
          headers: {
            'access-control-allow-origin': 'https://not-the-blog.test',
          },
        });
      if (failure === 'timeout') return; // The client deadline aborts the held request.
      if (failure === 'invalid JSON')
        return route.fulfill({
          body: '{broken',
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
        });
      return route.fulfill({
        json:
          failure === 'missing field'
            ? {}
            : { data: { url: 'https://wallpaper.test/broken.png' } },
        headers: { 'access-control-allow-origin': '*' },
      });
    });
    await page.route('https://wallpaper.test/broken.png', (route) =>
      route.fulfill({ body: 'not an image', contentType: 'image/png' }),
    );
    await page.route('https://wallpaper.test/valid.svg', (route) =>
      route.fulfill({ body: image, contentType: 'image/svg+xml' }),
    );
    await page.goto('/blog/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.wallpaper')).toHaveAttribute(
      'data-state',
      'fallback',
      { timeout: 11000 },
    );
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page
        .locator('.wallpaper-base')
        .evaluate((node) => node.complete && node.naturalWidth > 0),
    ).toBe(true);
    await expect(page.locator('.wallpaper-image')).not.toHaveAttribute(
      'src',
      /.+/,
    );
  });
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`layouts remain readable at ${width}px in both themes`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/blog/',
      post,
      '/blog/tags/',
      '/blog/tags/mathematics/',
    ]) {
      await page.goto(route);
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
        const header = await page.locator('.site-header').boundingBox();
        const heading = await page.locator('.page-heading').boundingBox();
        expect(heading.y).toBeGreaterThan(header.y + header.height);
        if (route === post && width < 960) {
          await expect(page.locator('.toc-mobile')).toBeVisible();
          await expect(page.locator('.toc-desktop')).toBeHidden();
        }
        if (
          (width === 390 || width === 1440) &&
          (route === post || route === '/blog/')
        ) {
          await page.screenshot({
            animations: 'disabled',
            path: testInfo.outputPath(
              `${route === post ? 'post' : 'index'}-${theme}-${width}.png`,
            ),
          });
        }
      }
    }
  });
}

test('hashes clear the sticky header and the ToC tracks reading', async ({
  page,
}) => {
  await page.goto(`${post}#algorithms`);
  await expect(
    page.locator('.toc-desktop a[href="#algorithms"]'),
  ).toHaveAttribute('aria-current', 'location');
  const header = await page.locator('.site-header').boundingBox();
  const heading = await page.locator('#algorithms').boundingBox();
  expect(heading.y).toBeGreaterThan(header.y + header.height);
  await page.locator('.toc-desktop a[href="#mathematics"]').click();
  await expect(page).toHaveURL(`${post}#mathematics`);
  await expect(
    page.locator('.toc-desktop a[href="#mathematics"]'),
  ).toHaveAttribute('aria-current', 'location');
});

test('reduced motion and unavailable View Transitions preserve navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.startViewTransition = undefined;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/blog/');
  await page.locator('.post-link').click();
  await expect(page).toHaveURL(post);
  await settled(page);
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe('auto');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.goBack();
  await expect(page.locator('.post-link')).toBeVisible();
});

test('native transitions morph a surface and clear all transient state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/blog/');
  test.skip(
    !(await page.evaluate(() => !!document.startViewTransition)),
    'Browser uses the fallback transition',
  );
  await page.evaluate(() => {
    window.motionStates = [];
    document.addEventListener('astro:after-swap', () =>
      window.motionStates.push(document.documentElement.dataset.motion),
    );
  });
  await page.locator('.post-link').click();
  await settled(page);
  expect(await page.evaluate(() => window.motionStates)).toContain('open');
  await page.goBack();
  await settled(page);
  expect(await page.evaluate(() => window.motionStates)).toContain('close');
  await expect(
    page.locator('[data-shared-surface], [data-motion-region]'),
  ).toHaveCount(0);
  await page.locator('.post-link').click();
  await page.locator('[data-nav="tags"]').click();
  await expect(page).toHaveURL('/blog/tags/');
  await settled(page);
  await expect(
    page.locator('[data-shared-surface], [data-motion-region]'),
  ).toHaveCount(0);
});

test('no JavaScript retains content, links, wallpaper and system theme', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4188/blog/');
  await expect(page.locator('.theme-toggle')).toBeHidden();
  await expect(page.locator('.wallpaper-base')).toHaveAttribute(
    'src',
    '/blog/backgrounds/aurora.svg',
  );
  expect(
    await page
      .locator('html')
      .evaluate((node) => getComputedStyle(node).colorScheme),
  ).toBe('dark');
  await page.locator('.post-link').click();
  await expect(page).toHaveURL(post);
  await expect(page.locator('.environment-theorem')).toBeVisible();
  await context.close();
});

test('history restores a scrolled list and offscreen cards do not morph', async ({
  page,
}) => {
  await page.route('**/blog/', async (route) => {
    const response = await route.fetch();
    const $ = load(await response.text());
    const card = $('.post-card').first();
    for (let i = 0; i < 5; i++) {
      const clone = card.clone().attr('data-post-key', `layout-fixture-${i}`);
      card.before(clone);
    }
    await route.fulfill({ response, body: $.html() });
  });
  await page.goto('/blog/');
  const link = page.locator('[data-post-key="welcome"] .post-link');
  await link.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  expect(scroll).toBeGreaterThan(500);
  await link.click();
  await settled(page);
  await page.locator('#algorithms').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.returnMode = '';
    document.addEventListener(
      'astro:after-swap',
      () => {
        window.returnMode = document.documentElement.dataset.motion;
      },
      { once: true },
    );
  });
  await page.goBack();
  await settled(page);
  expect(await page.evaluate(() => window.returnMode)).toBe('fade');
  expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(
    3,
  );
  await expect(link).toBeFocused();
});

test('long headings, tags and magnified text stay inside the layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(post);
  await page.evaluate(() => {
    document.querySelector('h1').textContent = 'AnUnbrokenHeading'.repeat(15);
    document.querySelector('.tags a').textContent =
      'A very long topic label which needs to wrap naturally';
    document.documentElement.style.fontSize = '200%';
    document.querySelector('.prose').style.fontSize = '32px';
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.locator('.toc-mobile summary').click();
  await expect(page.locator('.toc-mobile nav')).toBeVisible();
});

test('all glass treatments retain contrast over black and white wallpapers', async ({
  page,
}) => {
  await page.goto(post);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    const ratios = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      const parse = (value) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const blend = (top, bottom) =>
        top
          .slice(0, 3)
          .map(
            (channel, i) =>
              channel * (top[3] ?? 1) + bottom[i] * (1 - (top[3] ?? 1)),
          );
      const luminance = (color) =>
        color
          .slice(0, 3)
          .map((c) => c / 255)
          .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
          .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const root = getComputedStyle(document.documentElement);
      const scrim = parse(
        getComputedStyle(document.querySelector('.wallpaper-scrim'))
          .backgroundColor,
      );
      const shine = parse(root.getPropertyValue('--shine'));
      const foregrounds = ['--ink', '--muted', '--accent'].map((token) =>
        parse(root.getPropertyValue(token)),
      );
      return ['.site-header', '.article-heading', '.reading-card'].flatMap(
        (selector) => {
          const fill = parse(
            getComputedStyle(
              document.querySelector(`${selector} > .glass-surface`),
            ).backgroundColor,
          );
          return [
            [0, 0, 0],
            [255, 255, 255],
          ].flatMap((wallpaper) => {
            const base = blend(fill, blend(scrim, wallpaper));
            return [base, blend(shine, base)].flatMap((background) =>
              foregrounds.map((text) => {
                const a = luminance(text),
                  b = luminance(background);
                return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
              }),
            );
          });
        },
      );
    });
    ratios.forEach((ratio) => expect(ratio).toBeGreaterThanOrEqual(4.5));
  }
});

test('increased contrast provides opaque glass and forced colors preserve controls', async ({
  page,
}) => {
  await page.emulateMedia({ contrast: 'more' });
  await page.goto(post);
  expect(
    await page
      .locator('.reading-card > .glass-surface')
      .evaluate((node) => getComputedStyle(node).backdropFilter),
  ).toBe('none');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.wallpaper')).toBeHidden();
  await expect(page.locator('.theme-toggle')).toBeVisible();
});

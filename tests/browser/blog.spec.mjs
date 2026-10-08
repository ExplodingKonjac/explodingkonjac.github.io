import { test, expect } from '@playwright/test';
import { load } from 'cheerio';

const post = '/blog/posts/welcome/';
const themeKey = 'blog-appearance-theme';
const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#b4c4f0"/></svg>';

test.beforeEach(async ({ page }) => {
  await page.route('https://uapis.cn/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: image }),
  );
});

async function settled(page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-motion', /.+/);
}
async function pixelDifferences(page, before, after, regions) {
  return page.evaluate(
    async ({ a, b, regions }) => {
      const read = async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return {
          data: context.getImageData(0, 0, image.width, image.height).data,
          width: image.width,
        };
      };
      const first = await read(a),
        second = await read(b);
      return Object.fromEntries(
        Object.entries(regions).map(([name, [x, y, width, height]]) => {
          let difference = 0,
            count = 0;
          for (let row = Math.ceil(y); row < y + height; row++)
            for (let col = Math.ceil(x); col < x + width; col++) {
              const index = (row * first.width + col) * 4;
              for (let channel = 0; channel < 3; channel++) {
                difference += Math.abs(
                  first.data[index + channel] - second.data[index + channel],
                );
                count++;
              }
            }
          return [name, difference / count];
        }),
      );
    },
    {
      a: `data:image/png;base64,${before.toString('base64')}`,
      b: `data:image/png;base64,${after.toString('base64')}`,
      regions,
    },
  );
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
  for (const heading of await page
    .locator('.prose :is(h2, h3, h4, h5, h6)[id]')
    .all()) {
    const anchor = heading.locator(':scope > .heading-anchor');
    await expect(anchor).toHaveAttribute(
      'href',
      `#${await heading.getAttribute('id')}`,
    );
    await expect(anchor).toHaveAttribute('aria-label', 'Link to this heading');
  }
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

test('live transitions morph a surface and clear all transient state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/blog/');
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
    page.locator('[data-nav-layer], [data-flight-target], .glass-flight'),
  ).toHaveCount(0);
  await page.locator('.post-link').click();
  await page.locator('[data-nav="tags"]').click();
  await expect(page).toHaveURL('/blog/tags/');
  await settled(page);
  await expect(
    page.locator('[data-nav-layer], [data-flight-target], .glass-flight'),
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
  expect(await page.evaluate(() => window.returnMode)).toBe('reveal');
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

test('reading glass retains contrast over black and white wallpapers', async ({
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
      return ['.reading-card'].flatMap((selector) => {
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
      });
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

test('returning through Blog collapses the live article before swapping', async ({
  page,
}) => {
  await page.goto(post);
  const original = await page.locator('.reading-card').boundingBox();
  const scrollHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    window.exitAnimations = [];
    window.restoreAnimate = () => {
      Element.prototype.animate = animate;
    };
    Element.prototype.animate = function (frames, options) {
      const result = animate.call(this, frames, options);
      if (
        this.closest('.page-stage') &&
        Array.isArray(frames) &&
        frames.at(-1).visibility === 'hidden'
      ) {
        result.pause();
        result.currentTime = options.duration / 2;
        window.exitAnimations.push(result);
      }
      return result;
    };
  });
  await page.locator('[data-nav="blog"]').click();
  await expect
    .poll(() => page.evaluate(() => window.exitAnimations.length))
    .toBeGreaterThan(0);
  await expect(page).toHaveURL(post);
  const material = await page
    .locator('.reading-card > .glass-surface')
    .evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      opacity: getComputedStyle(node).opacity,
    }));
  expect(material.height).toBeGreaterThan(0);
  expect(material.height).toBeLessThan(original.height);
  expect(material.opacity).toBe('1');
  expect(await page.locator('.reading-card').boundingBox()).toEqual(original);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    scrollHeight,
  );
  await expect(page.locator('.reading-card > .prose')).not.toHaveCSS(
    'clip-path',
    'none',
  );
  expect(
    await page
      .locator('.reading-card')
      .evaluate((node) => getComputedStyle(node).opacity),
  ).toBe('1');
  await page.evaluate(() => {
    window.exitAnimations.forEach((animation) => animation.finish());
    window.restoreAnimate();
  });
  await settled(page);
  await expect(page).toHaveURL('/blog/');
});

test('mounted glass has its final material throughout its entrance', async ({
  page,
}) => {
  await page.goto('/blog/');
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    window.entranceAnimations = [];
    window.restoreAnimate = () => {
      Element.prototype.animate = animate;
    };
    Element.prototype.animate = function (frames, options) {
      const result = animate.call(this, frames, options);
      if (
        this.closest('.page-stage') &&
        Array.isArray(frames) &&
        frames[0].visibility === 'hidden'
      ) {
        result.pause();
        result.currentTime = options.delay + options.duration / 2;
        window.entranceAnimations.push(result);
      }
      return result;
    };
  });
  await page.locator('.post-link').click();
  await expect
    .poll(() => page.evaluate(() => window.entranceAnimations.length))
    .toBeGreaterThan(0);
  const material = await page
    .locator('.reading-card > .glass-surface')
    .evaluate((node) => ({
      fill: getComputedStyle(node).backgroundColor,
      filter: getComputedStyle(node).backdropFilter,
      ancestors: [
        node.parentElement,
        node.closest('.page-stage'),
        document.querySelector('main'),
      ].map((parent) => getComputedStyle(parent).opacity),
    }));
  expect(material.ancestors).toEqual(['1', '1', '1']);
  expect(material.filter).not.toBe('none');
  await page.evaluate(() => {
    window.entranceAnimations.forEach((animation) => animation.finish());
    window.restoreAnimate();
  });
  await settled(page);
  expect(
    await page
      .locator('.reading-card > .glass-surface')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe(material.fill);
});

for (const width of [320, 390, 1440]) {
  test(`navbar continuously docks without changing material at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(post);
    const header = page.locator('.site-header');
    const material = () =>
      header
        .locator('.glass-surface')
        .evaluate((node) => [
          getComputedStyle(node).backgroundColor,
          getComputedStyle(node).backdropFilter,
        ]);
    const original = await header.boundingBox();
    const before = await material();
    const borders = () =>
      header.locator('.glass-surface').evaluate((node) => {
        const style = getComputedStyle(node);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        return [
          style.borderTopColor,
          style.borderLeftColor,
          style.borderRightColor,
          style.borderBottomColor,
        ].map((color) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return context.getImageData(0, 0, 1, 1).data[3];
        });
      });
    const floatingBorders = await borders();
    const widths = [];
    for (const position of [30, 60, 90, 140]) {
      await page.evaluate(
        (y) => scrollTo({ top: y, behavior: 'instant' }),
        position,
      );
      await expect
        .poll(async () => (await header.boundingBox()).width)
        .toBeGreaterThan(original.width);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      widths.push((await header.boundingBox()).width);
      const nav = await header.locator('nav').boundingBox();
      const button = await header.locator('.theme-toggle').boundingBox();
      const intersection =
        Math.max(
          0,
          Math.min(nav.x + nav.width, button.x + button.width) -
            Math.max(nav.x, button.x),
        ) *
        Math.max(
          0,
          Math.min(nav.y + nav.height, button.y + button.height) -
            Math.max(nav.y, button.y),
        );
      expect(intersection).toBeLessThan(1);
    }
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    const docked = await header.boundingBox();
    expect(docked.x).toBeCloseTo(0, 0);
    expect(docked.y).toBeCloseTo(0, 0);
    expect(docked.width).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    expect(await material()).toEqual(before);
    await expect.poll(borders).toEqual([0, 0, 0, floatingBorders[3]]);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-docked', 'false');
    await expect
      .poll(async () => (await header.boundingBox()).width)
      .toBeCloseTo(original.width, 0);
    await expect.poll(borders).toEqual(floatingBorders);
  });
}

for (const width of [390, 1536]) {
  test(`navbar returns to its floating bounds across routes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/blog/');
    const header = page.locator('.site-header');
    const assertFloating = async () => {
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      const shell = await page.locator('.shell').boundingBox();
      const top = await page
        .locator('.header-slot')
        .evaluate((node) => parseFloat(getComputedStyle(node).top));
      const radius = page.viewportSize().width <= 600 ? 22 : 28;
      await expect
        .poll(async () => {
          const bounds = await header.boundingBox();
          const actualRadius = await header.evaluate((node) =>
            parseFloat(getComputedStyle(node).borderTopLeftRadius),
          );
          return Math.max(
            Math.abs(bounds.x - shell.x),
            Math.abs(bounds.y - top),
            Math.abs(bounds.width - shell.width),
            Math.abs(actualRadius - radius),
          );
        })
        .toBeLessThan(0.1);
      const bounds = await header.boundingBox();
      const wordmark = await header.locator('.wordmark').boundingBox();
      const controls = await header.locator('nav').boundingBox();
      expect(wordmark.x).toBeGreaterThan(bounds.x);
      expect(controls.x + controls.width).toBeLessThan(bounds.x + bounds.width);
    };
    await assertFloating();
    await page.locator('[data-nav="tags"]').click();
    await expect(page).toHaveURL('/blog/tags/');
    await settled(page);
    await assertFloating();
    await page.locator('[data-nav="blog"]').click();
    await expect(page).toHaveURL('/blog/');
    await settled(page);
    await page.locator('.post-link').click();
    await expect(page).toHaveURL(post);
    await settled(page);
    await assertFloating();
    await page.evaluate(() => scrollTo({ top: 500, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-docked', 'true');
    await page.locator('[data-nav="blog"]').click();
    await expect(page).toHaveURL('/blog/');
    await settled(page);
    await assertFloating();
    await page.goBack();
    await expect(page).toHaveURL(post);
    await settled(page);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(500);
    await expect(header).toHaveAttribute('data-docked', 'true');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await assertFloating();
    // Resize after a document swap must use the current page's layout too.
    await page.setViewportSize({ width: width + 120, height: 900 });
    await assertFloating();
  });
}

test('summary titles use the card width instead of a narrow text column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/blog/');
  const title = page.locator('.post-link');
  await title.evaluate((node) => {
    node.firstChild.textContent =
      'A longer title that should use the entire width of this glass card before wrapping onto a second line';
  });
  const card = await page.locator('.post-card').boundingBox();
  expect((await title.boundingBox()).width).toBeGreaterThan(card.width * 0.85);
  await page.goto(post);
  const heading = await page.locator('h1').boundingBox();
  expect(heading.width).toBeGreaterThan(card.width * 0.85);
});

test('overview titles paint clearly above the glass in both themes', async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/blog/');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      const title = page.locator('.post-card [data-post-title]');
      const surface = page.locator('.post-card > .glass-surface');
      const glass = await title.screenshot({ animations: 'disabled' });
      const ink = await title.locator('a').evaluate((node) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.fillStyle = getComputedStyle(node).color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      });
      await surface.evaluate((node) => (node.style.visibility = 'hidden'));
      const bare = await title.screenshot({ animations: 'disabled' });
      await surface.evaluate((node) => node.style.removeProperty('visibility'));
      // Compare opaque glyph interiors, excluding their antialiased boundaries:
      // glass may change the background, but must never tint or blur the title.
      const pixels = await page.evaluate(
        async ({ glass, bare, ink }) => {
          const read = async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, image.width, image.height).data;
          };
          const reference = await read(bare);
          const actual = await read(glass);
          let glyphs = 0,
            unchanged = 0;
          for (let i = 0; i < reference.length; i += 4) {
            if (
              ink.every(
                (channel, j) => Math.abs(reference[i + j] - channel) < 2,
              )
            ) {
              glyphs++;
              if (
                ink.every((channel, j) => Math.abs(actual[i + j] - channel) < 4)
              )
                unchanged++;
            }
          }
          return { glyphs, unchanged };
        },
        {
          glass: `data:image/png;base64,${glass.toString('base64')}`,
          bare: `data:image/png;base64,${bare.toString('base64')}`,
          ink,
        },
      );
      expect(pixels.glyphs).toBeGreaterThan(100);
      expect(pixels.unchanged / pixels.glyphs).toBeGreaterThan(0.98);
    }
  }
});

for (const blur of [4, 24]) {
  test(`uniform blur opt-out retains refraction at ${blur}px`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'SVG backdrop displacement is a Blink enhancement',
    );
    await page.route('**/blog/', async (route) => {
      const response = await route.fetch();
      const $ = load(await response.text());
      $('head').append(
        `<style>:root { --blur: ${blur}px !important; --blur-edge-ratio: 1; }</style>`,
      );
      await route.fulfill({ response, body: $.html() });
    });
    await page.goto('/blog/');
    await page.addStyleTag({
      content:
        '.wallpaper img, .wallpaper-scrim {display:none!important} .wallpaper {background:repeating-linear-gradient(90deg,#202020 0px,#202020 48px,#eeeeee 48px,#eeeeee 96px)!important}',
    });
    await expect(page.locator('.post-card > .glass-surface')).toHaveAttribute(
      'data-refractive',
      '',
    );
    const box = await page.locator('.post-card').boundingBox();
    const lens = await page.screenshot({ clip: box, animations: 'disabled' });
    await page.evaluate(() =>
      document
        .querySelectorAll('feDisplacementMap')
        .forEach((filter) => filter.setAttribute('scale', '0')),
    );
    const flat = await page.screenshot({ clip: box, animations: 'disabled' });
    await page.addStyleTag({
      content: `.post-card > .glass-surface {backdrop-filter:blur(${blur}px) saturate(135%) !important}`,
    });
    const ordinaryBlur = await page.screenshot({
      clip: box,
      animations: 'disabled',
    });
    const regions = {
      left: [4, 30, 12, box.height - 60],
      right: [box.width - 16, 30, 12, box.height - 60],
      center: [40, 30, box.width - 80, box.height - 60],
    };
    const displacement = await pixelDifferences(page, lens, flat, regions);
    const uniformBlur = await pixelDifferences(
      page,
      flat,
      ordinaryBlur,
      regions,
    );
    expect((displacement.left + displacement.right) / 2).toBeGreaterThan(2);
    expect(displacement.center).toBeLessThan(1);
    // Turning off displacement must leave the same native blur at the rim and center.
    for (const difference of Object.values(uniformBlur))
      expect(difference).toBeLessThan(1);
  });
}

for (const width of [390, 1440]) {
  test(`docked navbar refracts only its bottom edge at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'SVG backdrop displacement is a Blink enhancement',
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto(post);
    await page.addStyleTag({
      content: `
      .wallpaper img, .wallpaper-scrim { display: none !important; }
      .wallpaper { background: repeating-conic-gradient(#193853 0% 25%, #cae6ef 0% 50%) 0 0 / 64px 64px !important; }
      .page-stage, .header-inner { visibility: hidden; }
    `,
    });
    const header = page.locator('.site-header');
    const surface = header.locator('.glass-surface');
    const filterId = await surface.evaluate(
      (node) => node.style.getPropertyValue('--refraction').match(/#[^"]+/)[0],
    );
    const lens = page.locator(`${filterId} feDisplacementMap`);
    for (const position of [0, 140, 0]) {
      await page.evaluate(
        (y) => scrollTo({ top: y, behavior: 'instant' }),
        position,
      );
      await expect(header).toHaveAttribute(
        'data-docked',
        position ? 'true' : 'false',
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await lens.evaluate((node) => node.setAttribute('scale', '32'));
      const box = await header.boundingBox();
      const refracted = await page.screenshot({
        clip: box,
        animations: 'disabled',
      });
      await lens.evaluate((node) => node.setAttribute('scale', '0'));
      const flat = await page.screenshot({ clip: box, animations: 'disabled' });
      const differences = await pixelDifferences(page, refracted, flat, {
        top: [32, 4, box.width - 64, 12],
        left: [4, 22, 12, box.height - 44],
        right: [box.width - 16, 22, 12, box.height - 44],
        bottom: [32, box.height - 16, box.width - 64, 12],
      });
      expect(differences.bottom).toBeGreaterThan(2);
      for (const side of ['top', 'left', 'right']) {
        if (position) expect(differences[side]).toBeLessThan(1);
        else expect(differences[side]).toBeGreaterThan(2);
      }
    }
  });
}

test('glass blur increases continuously from rim to center', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'SVG gradient blur is a Blink enhancement',
  );
  await page.route('**/blog/', async (route) => {
    const response = await route.fetch();
    const $ = load(await response.text());
    $('head').append(
      '<style>:root { --blur: 12px !important; --refraction-strength: 0; }</style>',
    );
    await route.fulfill({ response, body: $.html() });
  });
  await page.goto('/blog/');
  await page.addStyleTag({
    content: `
    .wallpaper img, .wallpaper-scrim {display:none!important}
    .wallpaper {background:repeating-linear-gradient(90deg,#202020 0 12px,#eeeeee 12px 24px)!important}
    .post-card > :not(.glass-surface) {visibility:hidden}
    .post-card {--shine:transparent}
  `,
  });
  const box = await page.locator('.post-card').boundingBox();
  const graduated = await page.screenshot({
    clip: box,
    animations: 'disabled',
  });
  const profile = await page.evaluate(
    async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      // The same repeated pattern loses contrast progressively as diffusion grows.
      return [4, 16, 28, 40, 52, 64, 80].map((depth) => {
        let sum = 0,
          squares = 0,
          count = 0;
        for (let y = depth; y < depth + 4; y++)
          for (let x = 96; x < image.width - 96; x++) {
            const value = data[(y * image.width + x) * 4];
            sum += value;
            squares += value * value;
            count++;
          }
        return Math.sqrt(squares / count - (sum / count) ** 2);
      });
    },
    `data:image/png;base64,${graduated.toString('base64')}`,
  );
  expect(profile[0]).toBeGreaterThan(15);
  for (let i = 1; i < 6; i++) {
    expect(profile[i]).toBeLessThan(profile[i - 1]);
    expect(profile[i - 1] - profile[i]).toBeLessThan(profile[0] * 0.4);
  }
  expect(profile[6]).toBeLessThan(profile[0] * 0.1);
  expect(Math.abs(profile[6] - profile[5])).toBeLessThan(1);
  await page.addStyleTag({
    content:
      '.post-card > .glass-surface {backdrop-filter:blur(12px) saturate(135%)!important}',
  });
  const fullBlur = await page.screenshot({ clip: box, animations: 'disabled' });
  const delta = await pixelDifferences(page, graduated, fullBlur, {
    center: [96, 80, box.width - 192, box.height - 160],
  });
  expect(delta.center).toBeLessThan(2);
});

async function holdIncomingMotion(page) {
  await page.evaluate(() => {
    window.heldMotion = [];
    window.originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = window.originalAnimate.call(this, frames, options);
      if (document.documentElement.hasAttribute('data-entering')) {
        animation.pause();
        animation.currentTime = 0;
        window.heldMotion.push(animation);
      }
      return animation;
    };
  });
}
async function finishHeldMotion(page) {
  await page.evaluate(() => {
    Element.prototype.animate = window.originalAnimate;
    window.heldMotion.forEach((animation) => animation.finish());
  });
  await settled(page);
}

for (const width of [390, 1440]) {
  test(`cards unfold and stream content without shifting layout at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/blog/tags/');
    await holdIncomingMotion(page);
    await page.locator('[data-nav="blog"]').click();
    await expect(page).toHaveURL('/blog/');
    const card = page.locator('.page-heading');
    const surface = card.locator('.glass-surface');
    const title = card.locator('h1');
    await expect(card).toHaveAttribute('inert', '');
    const full = await card.boundingBox();
    const text = await title.textContent();
    const font = await title.evaluate(
      (node) => getComputedStyle(node).fontSize,
    );
    const scrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await expect(surface).toHaveCSS('visibility', 'hidden');
    await expect(title).toHaveCSS('visibility', 'hidden');
    let previous = 0;
    for (const time of [30, 70, 140, 260, 360]) {
      await page.evaluate(
        (time) =>
          window.heldMotion.forEach(
            (animation) => (animation.currentTime = time),
          ),
        time,
      );
      const material = await surface.boundingBox();
      expect(material.height).toBeGreaterThan(previous);
      previous = material.height;
      expect(material.width).toBeCloseTo(full.width, 1);
      expect(await card.boundingBox()).toEqual(full);
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight),
      ).toBe(scrollHeight);
      await expect(surface).toHaveCSS('opacity', '1');
      await expect(card).toHaveCSS('clip-path', 'none');
      await expect(card).toHaveCSS('opacity', '1');
      await expect(title).toHaveCSS('font-size', font);
      await expect(title).toHaveCSS('transform', 'none');
      expect(await title.textContent()).toBe(text);
      const edge = await title.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const bottomInset = Number(
          getComputedStyle(node).clipPath.match(/-?[\d.]+/g)[2],
        );
        return box.bottom - bottomInset;
      });
      const padding = await card.evaluate((node) =>
        parseFloat(getComputedStyle(node).paddingBottom),
      );
      expect(
        Math.abs(edge - (material.y + material.height - padding)),
      ).toBeLessThan(0.2);
      if (time === 70)
        await page.screenshot({
          path: testInfo.outputPath(`card-unfold-${width}.png`),
        });
    }
    await finishHeldMotion(page);
    await expect(card).not.toHaveAttribute('inert');
    await expect(title).toHaveCSS('clip-path', 'none');
    await expect(surface).toHaveCSS('visibility', 'visible');
    expect((await surface.boundingBox()).height).toBeCloseTo(full.height, 1);
    await expect(
      page.locator('.page-stage [inert], [data-nav-layer]'),
    ).toHaveCount(0);
  });
}

for (const width of [390, 1440]) {
  test(`tag tile and live label morph into their category header at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/blog/tags/');
    await page.evaluate(() => {
      window.tagModes = [];
      document.addEventListener('astro:after-swap', () =>
        window.tagModes.push(document.documentElement.dataset.motion),
      );
    });
    const card = page.locator('.tag-index [data-tag-key="mathematics"]');
    const source = await card.boundingBox();
    const sourceFont = await card
      .locator('[data-tag-label]')
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    await holdIncomingMotion(page);
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/blog/tags/mathematics/');
    const flight = page.locator('.glass-flight');
    const label = page.locator('.glass-flight-label');
    const heading = page.locator('.tag-heading');
    await expect(label).toBeVisible();
    await expect(heading.locator('h1')).toHaveAttribute(
      'data-flight-target',
      '',
    );
    const destination = await heading.boundingBox();
    const destinationFont = await heading
      .locator('h1')
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    const initial = await flight.boundingBox();
    expect(initial.y).toBeCloseTo(source.y, 0);
    expect(initial.width).toBeCloseTo(source.width, 0);
    await page.evaluate(() =>
      window.heldMotion.forEach((animation) => (animation.currentTime = 210)),
    );
    const middle = await flight.boundingBox();
    expect(middle.y).toBeLessThan(source.y);
    expect(middle.y).toBeGreaterThan(destination.y);
    expect(middle.height).toBeGreaterThan(source.height);
    expect(middle.height).toBeLessThan(destination.height);
    if (width > 960) {
      expect(middle.width).toBeGreaterThan(source.width);
      expect(middle.width).toBeLessThan(destination.width);
    }
    const font = await label.evaluate((node) => ({
      size: parseFloat(getComputedStyle(node).fontSize),
      transform: getComputedStyle(node).transform,
    }));
    expect(font.size).toBeGreaterThan(sourceFont);
    expect(font.size).toBeLessThan(destinationFont);
    expect(font.transform).toBe('none');
    const labelBounds = await label.boundingBox();
    expect(labelBounds.x).toBeGreaterThan(middle.x);
    expect(labelBounds.y).toBeGreaterThan(middle.y);
    expect(labelBounds.y + labelBounds.height).toBeLessThan(
      middle.y + middle.height,
    );
    expect(
      await page
        .locator('.post-card > .glass-surface')
        .evaluate((node) => getComputedStyle(node).visibility),
    ).toBe('hidden');
    await page.screenshot({
      path: testInfo.outputPath(`tag-morph-mid-${width}.png`),
    });
    await page.evaluate(() =>
      window.heldMotion.forEach((animation) => (animation.currentTime = 420)),
    );
    const landed = await flight.boundingBox();
    expect(landed.x).toBeCloseTo(destination.x, 0);
    expect(landed.y).toBeCloseTo(destination.y, 0);
    expect(landed.width).toBeCloseTo(destination.width, 0);
    expect(
      await label.evaluate((node) =>
        parseFloat(getComputedStyle(node).fontSize),
      ),
    ).toBeCloseTo(destinationFont, 1);
    await finishHeldMotion(page);
    await expect(heading.locator('h1')).toBeFocused();
    await expect(
      page.locator('.glass-flight, [data-flight-target], [data-nav-layer]'),
    ).toHaveCount(0);
    await page.goBack();
    await settled(page);
    await expect(card).toBeFocused();
    expect(await page.evaluate(() => window.tagModes)).toEqual([
      'open',
      'close',
    ]);
  });
}

test('tag motion cleans up during interrupted navigation and respects reduced motion', async ({
  page,
}) => {
  await page.goto('/blog/tags/');
  await holdIncomingMotion(page);
  await page.locator('[data-tag-key="mathematics"]').click();
  await expect(page).toHaveURL('/blog/tags/mathematics/');
  await expect(page.locator('.glass-flight-label')).toBeVisible();
  await page.evaluate(
    () => (Element.prototype.animate = window.originalAnimate),
  );
  await page.locator('[data-nav="blog"]').click();
  await expect(page).toHaveURL('/blog/');
  await settled(page);
  await expect(
    page.locator('.glass-flight, [data-flight-target], [data-nav-layer]'),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-nav="tags"]').click();
  await settled(page);
  const tag = page.locator('.tag-index [data-tag-key="mathematics"]');
  await tag.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/blog/tags/mathematics/');
  await settled(page);
  await expect(page.locator('.glass-flight-label')).toHaveCount(0);
  await expect(page.locator('h1')).toBeFocused();
  await page.goBack();
  await settled(page);
  await expect(tag).toBeFocused();
});

test('wrapped tag labels crossfade without reflowing the moving title', async ({
  page,
}) => {
  const title =
    'Mathematical structures and algorithms across several connected topics';
  await page.setViewportSize({ width: 390, height: 1000 });
  for (const routeUrl of ['**/blog/tags/', '**/blog/tags/mathematics/']) {
    await page.route(routeUrl, async (route) => {
      const response = await route.fetch();
      const $ = load(await response.text());
      const card = $('[data-tag-key="mathematics"]').attr(
        'data-tag-key',
        title,
      );
      card.find('[data-tag-label]').text(title);
      await route.fulfill({ response, body: $.html() });
    });
  }
  await page.goto('/blog/tags/');
  await holdIncomingMotion(page);
  await page.locator('.tag-index a').filter({ hasText: title }).click();
  await expect(page).toHaveURL('/blog/tags/mathematics/');
  await expect(page.locator('.glass-flight-label')).toBeVisible();
  await expect(page.locator('.tag-heading h1')).not.toHaveAttribute(
    'data-flight-target',
  );
  const frames = await page
    .locator('.glass-flight-label')
    .evaluate((node) => node.getAnimations()[0].effect.getKeyframes());
  expect(frames.at(-1).opacity).toBe('0');
  expect(frames.some((frame) => 'fontSize' in frame)).toBe(false);
  await finishHeldMotion(page);
  await expect(page.locator('h1')).toHaveText(title);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('post card carries its title, description and tags into the article header and back', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/blog/');
  const source = await page.locator('.post-card').boundingBox();
  const sourceFont = await page
    .locator('[data-post-title]')
    .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  await holdIncomingMotion(page);
  // The empty card padding is part of the native post link too.
  await page.locator('.post-card').click({ position: { x: 20, y: 20 } });
  await expect(page).toHaveURL(post);
  const flight = page.locator('.glass-flight');
  const title = flight.locator(
    '.glass-flight-label[data-flight-copy="source"]',
  );
  const destination = await page.locator('.article-heading').boundingBox();
  const destinationFont = await page
    .locator('[data-post-title]')
    .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  await expect(flight).toHaveAttribute('inert', '');
  for (const selector of [
    '[data-post-title]',
    '[data-post-description]',
    '.tags',
  ])
    await expect(page.locator(`.article-heading ${selector}`)).toHaveAttribute(
      'data-flight-target',
      '',
    );
  await expect(flight.locator('.tags')).toBeVisible();
  await expect(
    flight.locator('[data-post-description][data-flight-copy="source"]'),
  ).toBeVisible();
  await page.evaluate(() =>
    window.heldMotion.forEach((a) => (a.currentTime = 210)),
  );
  const middle = await flight.boundingBox();
  expect(middle.y).toBeLessThan(source.y);
  expect(middle.y).toBeGreaterThan(destination.y);
  expect(middle.height).toBeGreaterThan(source.height);
  expect(middle.height).toBeLessThan(destination.height);
  const font = await title.evaluate((n) => ({
    size: parseFloat(getComputedStyle(n).fontSize),
    transform: getComputedStyle(n).transform,
  }));
  const incomingTitle = flight.locator(
    '.glass-flight-label[data-flight-copy="destination"]',
  );
  if (await incomingTitle.count()) {
    expect(font.size).toBe(sourceFont);
    const incoming = await incomingTitle.evaluate((n) => ({
      size: parseFloat(getComputedStyle(n).fontSize),
      opacity: Number(getComputedStyle(n).opacity),
    }));
    expect(incoming.size).toBe(destinationFont);
    expect(incoming.opacity).toBeGreaterThan(0);
    expect(incoming.opacity).toBeLessThan(1);
  } else {
    expect(font.size).toBeGreaterThan(sourceFont);
    expect(font.size).toBeLessThan(destinationFont);
  }
  expect(font.transform).toBe('none');
  expect(
    await page
      .locator('.reading-card > .glass-surface')
      .evaluate((n) => getComputedStyle(n).visibility),
  ).toBe('hidden');
  expect(
    await page
      .locator('.article-heading .post-date')
      .evaluate((n) => getComputedStyle(n).visibility),
  ).toBe('hidden');
  await page.screenshot({
    path: testInfo.outputPath('post-content-morph-mid.png'),
  });
  await page.evaluate(() =>
    window.heldMotion.forEach((a) => (a.currentTime = 630)),
  );
  for (const [clone, real] of [
    ['.glass-flight-label', '[data-post-title]'],
    ['.glass-flight-description', '[data-post-description]'],
    ['.tags', '.tags'],
  ]) {
    const geometry = await page.evaluate(
      ([a, b]) => {
        const first = [...document.querySelectorAll(`.glass-flight ${a}`)]
          .at(-1)
          .getBoundingClientRect();
        const second = document
          .querySelector(`.article-heading ${b}`)
          .getBoundingClientRect();
        return Math.max(
          ...['x', 'y', 'width', 'height'].map((k) =>
            Math.abs(first[k] - second[k]),
          ),
        );
      },
      [clone, real],
    );
    expect(geometry).toBeLessThan(0.2);
  }
  await finishHeldMotion(page);
  await holdIncomingMotion(page);
  await page.goBack();
  await expect(page).toHaveURL('/blog/');
  await expect(page.locator('.post-card [data-post-title]')).toHaveAttribute(
    'data-flight-target',
    '',
  );
  await expect(
    page.locator('.glass-flight-label[data-flight-copy="source"]'),
  ).toBeVisible();
  await page.evaluate(() =>
    window.heldMotion.forEach((a) => (a.currentTime = 210)),
  );
  const returningFont = await page
    .locator('.glass-flight-label[data-flight-copy="source"]')
    .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  if (
    await page
      .locator('.glass-flight-label[data-flight-copy="destination"]')
      .count()
  ) {
    expect(returningFont).toBe(destinationFont);
    const incoming = await page
      .locator('.glass-flight-label[data-flight-copy="destination"]')
      .evaluate((n) => ({
        size: parseFloat(getComputedStyle(n).fontSize),
        opacity: Number(getComputedStyle(n).opacity),
      }));
    expect(incoming.size).toBe(sourceFont);
    expect(incoming.opacity).toBeGreaterThan(0);
    expect(incoming.opacity).toBeLessThan(1);
  } else {
    expect(returningFont).toBeLessThan(destinationFont);
    expect(returningFont).toBeGreaterThan(sourceFont);
  }
  await finishHeldMotion(page);
  await expect(page.locator('.post-link')).toBeFocused();
  await expect(
    page.locator('.glass-flight, [data-flight-target], [data-nav-layer]'),
  ).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`wrapped post content keeps stable line breaks through its morph at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('/blog/');
    await holdIncomingMotion(page);
    await page.locator('.post-link').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(post);
    const flight = page.locator('.glass-flight');
    const oldTitle = flight.locator(
      '.glass-flight-label[data-flight-copy="source"]',
    );
    const newTitle = flight.locator(
      '.glass-flight-label[data-flight-copy="destination"]',
    );
    await expect(newTitle).toHaveCount(1);
    const oldHeight = (await oldTitle.boundingBox()).height;
    const newHeight = (await newTitle.boundingBox()).height;
    for (const t of [80, 150, 210, 300, 420]) {
      await page.evaluate(
        (t) => window.heldMotion.forEach((a) => (a.currentTime = t)),
        t,
      );
      expect((await oldTitle.boundingBox()).height).toBeCloseTo(oldHeight, 1);
      expect((await newTitle.boundingBox()).height).toBeCloseTo(newHeight, 1);
      const visible = await flight.evaluate((node) =>
        [
          ...node.querySelectorAll(
            '.glass-flight-label,.glass-flight-description,.tags',
          ),
        ]
          .filter((n) => Number(getComputedStyle(n).opacity) > 0.25)
          .map((n) => {
            const b = n.getBoundingClientRect();
            return {
              role: n.classList.contains('glass-flight-label')
                ? 'title'
                : n.classList.contains('tags')
                  ? 'tags'
                  : 'description',
              top: b.top,
              bottom: b.bottom,
              transform: getComputedStyle(n).transform,
            };
          }),
      );
      visible.forEach((n) => expect(n.transform).toBe('none'));
      const title = visible.find((n) => n.role === 'title'),
        description = visible.find((n) => n.role === 'description'),
        tags = visible.find((n) => n.role === 'tags');
      if (title && description)
        expect(title.bottom).toBeLessThanOrEqual(description.top + 1);
      if (description && tags)
        expect(description.bottom).toBeLessThanOrEqual(tags.top + 1);
    }
    await page.screenshot({
      path: testInfo.outputPath(`post-content-morph-${width}.png`),
    });
    await finishHeldMotion(page);
    await expect(page.locator('h1')).toBeFocused();
    await expect(page.locator('.article-heading .tags a')).toHaveCount(3);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

test('post content motion cleans up on interruption and supports reduced motion', async ({
  page,
}) => {
  await page.goto('/blog/');
  await holdIncomingMotion(page);
  await page.locator('.post-link').click();
  await expect(page).toHaveURL(post);
  await expect(page.locator('.glass-flight .tags')).toBeVisible();
  await page.evaluate(
    () => (Element.prototype.animate = window.originalAnimate),
  );
  await page.locator('[data-nav="tags"]').click();
  await expect(page).toHaveURL('/blog/tags/');
  await settled(page);
  await expect(
    page.locator('.glass-flight, [data-flight-target], [data-nav-layer]'),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-nav="blog"]').click();
  await settled(page);
  await page.locator('.post-link').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(post);
  await settled(page);
  await expect(page.locator('.glass-flight')).toHaveCount(0);
  await expect(page.locator('h1')).toBeFocused();
});

test('post card hit area preserves native modified clicks and separate tag links', async ({
  page,
  context,
}) => {
  await context.route('https://uapis.cn/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: image }),
  );
  await page.goto('/blog/');
  const popupPromise = context.waitForEvent('page');
  await page
    .locator('.post-card')
    .click({ position: { x: 20, y: 20 }, modifiers: ['ControlOrMeta'] });
  const popup = await popupPromise;
  await popup.waitForURL(`**${post}`);
  await expect(page).toHaveURL('/blog/');
  await popup.close();
  await page
    .locator('.post-card .tags a')
    .filter({ hasText: 'mathematics' })
    .click();
  await expect(page).toHaveURL('/blog/tags/mathematics/');
  await settled(page);
  await expect(page.locator('.post-card')).toHaveCount(1);
});

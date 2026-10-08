import { test, expect } from '@playwright/test';
import { load } from 'cheerio';
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

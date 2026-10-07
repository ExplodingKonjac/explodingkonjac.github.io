import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('hub, blog, post anchors, feed and real 404 work in production', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Notes, proofs',
  );
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.locator('.project').filter({ hasText: 'Blog' }).click();
  await expect(page).toHaveURL(/\/blog\/$/);
  await page
    .getByRole('link', {
      name: 'A notebook for ideas worth working through',
      exact: true,
    })
    .click();
  await expect(page.locator('.environment-theorem')).toContainText(
    'Pythagorean theorem',
  );
  await expect(page.locator('.katex-display').first()).toBeVisible();
  await expect(page.locator('figure img')).toBeVisible();
  await expect(
    page.locator('.prose #mathematics .heading-anchor'),
  ).toHaveAttribute('href', '#mathematics');
  await page.getByRole('link', { name: 'the theorem', exact: true }).click();
  await expect(page).toHaveURL(/#pythagoras$/);
  await expect(
    page.getByRole('navigation', { name: 'On this page' }),
  ).toBeVisible();
  expect((await request.get('/blog/rss.xml')).status()).toBe(200);
  expect((await request.get('/blog/sitemap-index.xml')).status()).toBe(200);
  expect((await request.get('/missing-page/')).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('drafts are absent from static routes, indexes, tags and feeds', async ({
  request,
}) => {
  expect((await request.get('/blog/posts/draft-example/')).status()).toBe(404);
  expect((await request.get('/blog/tags/draft-only/')).status()).toBe(404);
  for (const route of [
    '/blog/',
    '/blog/tags/',
    '/blog/rss.xml',
    '/blog/sitemap-0.xml',
  ]) {
    expect(await (await request.get(route)).text()).not.toMatch(
      /draft-example|draft-only|A draft for the next note/,
    );
  }
});

test('static development uses one origin without hot-reload clients or WebSockets', async ({
  page,
  request,
}) => {
  const errors = [];
  const brokenAssets = [];
  const sockets = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      ['script', 'stylesheet', 'image', 'font'].includes(
        response.request().resourceType(),
      )
    )
      brokenAssets.push(response.url());
  });
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  await expect(page.locator('script[src*="@vite/client"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Notes, proofs',
  );
  await page.locator('.project').filter({ hasText: 'Blog' }).click();
  await expect(page).toHaveURL(`${origin}/blog/`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Thinking in writing',
  );
  await page
    .getByRole('link', {
      name: 'A notebook for ideas worth working through',
      exact: true,
    })
    .click();
  await expect(page.locator('.environment-theorem')).toBeVisible();
  await expect(page.locator('figure img')).toBeVisible();
  await expect(page.locator('script[src*="@vite/client"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Tags', exact: true }).click();
  await page.getByRole('link', { name: 'mathematics', exact: false }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'mathematics',
  );
  expect(
    (await request.get('/blog/rss.xml')).headers()['content-type'],
  ).toContain('xml');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await page.locator('.project').filter({ hasText: 'ORBIT' }).click();
  await expect(page).toHaveURL(`${origin}/app/maimai-renderer/`);
  await expect
    .poll(() => page.evaluate(() => Boolean(window.ORBIT?.getResult())))
    .toBe(true);
  await expect(page.locator('script[src*="@vite/client"]')).toHaveCount(0);
  expect((await request.get('/missing-page/')).status()).toBe(404);
  expect(sockets).toEqual([]);
  expect(brokenAssets).toEqual([]);
  expect(errors).toEqual([]);
});

test('maimai renderer keeps file import, playback, inspection, help and export', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/app/maimai-renderer/');
  await expect
    .poll(() =>
      page.evaluate(() => window.ORBIT?.getResult()?.chart.notes.length ?? 0),
    )
    .toBeGreaterThan(0);
  await page.locator('#aboutBtn').click();
  await expect(page.locator('#aboutDialog')).toBeVisible();
  await page.locator('[data-close="aboutDialog"]').click();
  await page.locator('#importBtn').click();
  await page.locator('#chartFile').setInputFiles({
    name: 'smoke.simai',
    mimeType: 'text/plain',
    buffer: Buffer.from('(120)\n{4}1,2,3,4,E'),
  });
  await page.locator('#eventFile').setInputFiles({
    name: 'events.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('1\nL 0.000000 0.010000 K1\n'),
  });
  await expect(page.locator('#chartInput')).toHaveValue(/\(120\)/);
  await page.locator('#buildBtn').click();
  await expect(page.locator('#importDialog')).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.ORBIT.getResult()?.chart.notes.length),
    )
    .toBe(4);
  await page.locator('#playBtn').click();
  await expect
    .poll(() => page.evaluate(() => window.ORBIT.getState().playing))
    .toBe(true);
  await page.locator('#playBtn').click();
  await expect
    .poll(() => page.evaluate(() => window.ORBIT.getState().playing))
    .toBe(false);
  await page.locator('#openNotes').click();
  await expect(page.locator('#inspectorDialog')).toBeVisible();
  await expect(page.locator('#inspectTable tbody tr')).toHaveCount(4);
  const pendingDownload = page.waitForEvent('download');
  await page.locator('#downloadReport').click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('orbit-results.json');
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(report.session).toBe('smoke');
  expect(report.notes).toHaveLength(4);
  expect(report.events).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const [name, route] of [
  ['home', '/'],
  ['blog', '/blog/posts/welcome/'],
  ['app', '/app/maimai-renderer/'],
]) {
  test(`${name} fits a mobile viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    if (name === 'app')
      await expect
        .poll(() => page.evaluate(() => Boolean(window.ORBIT?.getResult())))
        .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-mobile.png`),
      fullPage: true,
    });
  });
}

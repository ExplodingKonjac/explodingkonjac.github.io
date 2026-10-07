import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { previewServer } from './preview.mjs';

test('production preview serves directories, redirects trailing slashes, and returns real 404s', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pages-preview-'));
  await mkdir(path.join(root, 'blog'));
  await writeFile(path.join(root, 'blog/index.html'), 'Blog');
  await writeFile(path.join(root, '404.html'), 'Not here');
  const server = previewServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(`${origin}/blog/`)).text(), 'Blog');
  const redirect = await fetch(`${origin}/blog?x=1`, { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/blog/?x=1');
  const missing = await fetch(`${origin}/blog/missing`);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not here');
});

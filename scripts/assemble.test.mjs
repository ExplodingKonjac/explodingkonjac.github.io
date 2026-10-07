import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assemble, validateRegistry } from './assemble.mjs';
import { components } from '@site/config';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pages-assembly-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const entry of components) {
    const dist = path.join(root, entry.directory, 'dist');
    await mkdir(dist, { recursive: true });
    await writeFile(path.join(dist, 'index.html'), entry.id);
  }
  return root;
}

test('assembles every component and clears stale output', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, '_site'));
  await writeFile(path.join(root, '_site', 'stale.html'), 'stale');
  const output = await assemble(root);
  assert.equal(
    await readFile(path.join(output, 'blog/index.html'), 'utf8'),
    'blog',
  );
  assert.equal(
    await readFile(path.join(output, 'app/maimai-renderer/index.html'), 'utf8'),
    'maimai-renderer',
  );
  await assert.rejects(readFile(path.join(output, 'stale.html')), {
    code: 'ENOENT',
  });
  assert.match(
    await readFile(path.join(output, '404.html'), 'utf8'),
    /href="\/blog\/"/,
  );
});
test('missing builds fail before clearing the previous assembly', async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, components[1].directory, 'dist/index.html'));
  await mkdir(path.join(root, '_site'));
  await writeFile(path.join(root, '_site', 'index.html'), 'previous');
  await assert.rejects(assemble(root), /Missing build output/);
  assert.equal(
    await readFile(path.join(root, '_site/index.html'), 'utf8'),
    'previous',
  );
});
test('rejects duplicate, overlapping and unsafe mounts', () => {
  assert.throws(
    () =>
      validateRegistry([...components, { ...components[1], id: 'duplicate' }]),
    /Duplicate/,
  );
  assert.throws(
    () =>
      validateRegistry([
        ...components,
        {
          id: 'nested',
          package: '@site/nested',
          directory: 'components/nested',
          mount: '/blog/nested/',
        },
      ]),
    /Overlapping/,
  );
  assert.throws(
    () =>
      validateRegistry([
        components[0],
        { ...components[1], mount: '/../escape/' },
      ]),
    /Invalid mount/,
  );
});
test('rejects homepage writes into reserved component directories', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'components/home/dist/blog'));
  await assert.rejects(assemble(root), /reserved subtree/);
});
test('rejects assembly-owned files and symlinks', async (t) => {
  const root = await fixture(t);
  const dist = path.join(root, 'components/home/dist');
  await writeFile(path.join(dist, '404.html'), 'collision');
  await assert.rejects(assemble(root), /Output collision/);
  await rm(path.join(dist, '404.html'));
  await symlink('index.html', path.join(dist, 'alias.html'));
  await assert.rejects(assemble(root), /Symlink/);
});

test('rejects a dist directory that is itself a symlink', async (t) => {
  const root = await fixture(t);
  const dist = path.join(root, 'components/home/dist');
  await rm(dist, { recursive: true });
  await symlink(path.join(root, 'components/blog/dist'), dist);
  await assert.rejects(assemble(root), /unsafe build output directory/);
});

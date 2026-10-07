import { test } from 'node:test';
import assert from 'node:assert/strict';
import { component, componentUrl, absoluteUrl } from '@site/config';

test('component URLs encode logical segments and retain mount paths', () => {
  assert.equal(componentUrl('blog'), '/blog/');
  assert.equal(
    componentUrl('blog', 'posts', 'category/note'),
    '/blog/posts/category/note/',
  );
  assert.equal(
    componentUrl('blog', 'tags', '数论'),
    '/blog/tags/%E6%95%B0%E8%AE%BA/',
  );
  assert.equal(componentUrl('blog', 'rss.xml'), '/blog/rss.xml');
  assert.equal(
    absoluteUrl(componentUrl('blog')),
    'https://explodingkonjac.github.io/blog/',
  );
  assert.throws(() => component('missing'), /Unknown component/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blogUrl, absoluteUrl } from './site.mjs';

test('blog URLs encode logical segments and retain the blog base', () => {
  assert.equal(blogUrl(), '/blog/');
  assert.equal(blogUrl('posts', 'category/note'), '/blog/posts/category/note/');
  assert.equal(blogUrl('tags', '数论'), '/blog/tags/%E6%95%B0%E8%AE%BA/');
  assert.equal(blogUrl('rss.xml'), '/blog/rss.xml');
  assert.equal(
    blogUrl('tags', 'C++ & proofs'),
    '/blog/tags/C%2B%2B%20%26%20proofs/',
  );
  assert.equal(
    absoluteUrl(blogUrl()),
    'https://explodingkonjac.github.io/blog/',
  );
});

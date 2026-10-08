import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPosts, type SearchEntry } from './search.ts';

const entries: SearchEntry[] = [
  {
    id: 'body',
    title: 'Algorithms',
    summary: 'A short note',
    content: 'Café proofs and 数学算法 with triangles.',
  },
  {
    id: 'summary',
    title: 'Geometry',
    summary: 'Triangle proofs',
    content: 'Different body',
  },
  {
    id: 'title',
    title: 'Triangle proofs',
    summary: 'Euclidean methods',
    content: 'A different body',
  },
];
test('search ranks title and summary matches ahead of body matches', () => {
  assert.deepEqual(
    searchPosts(entries, 'proofs').map((hit) => hit.id),
    ['title', 'summary', 'body'],
  );
  assert.match(searchPosts(entries, 'CAFÉ')[0].excerpt, /Café/);
});
test('search normalizes Unicode and combines terms across fields', () => {
  assert.deepEqual(
    searchPosts(entries, 'ＣＡＦＥ 数学').map((hit) => hit.id),
    ['body'],
  );
  assert.deepEqual(
    searchPosts(entries, 'algorithms triangles').map((hit) => hit.id),
    ['body'],
  );
  assert.deepEqual(searchPosts(entries, 'geometry absent'), []);
  assert.deepEqual(searchPosts(entries, '  '), []);
  assert.deepEqual(searchPosts(entries, '<script>alert(1)</script>'), []);
});

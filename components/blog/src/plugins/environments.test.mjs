import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import environments from './environments.mjs';
import { mathMacros } from './math-macros.mjs';
import { postSchema } from '../lib/post-schema.ts';

async function html(markdown) {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkMath)
      .use(environments)
      .use(remarkRehype)
      .use(rehypeKatex, { macros: mathMacros })
      .use(rehypeStringify)
      .process(markdown),
  );
}

test('renders optional titles, anchors, and Markdown within environments', async () => {
  const output = await html(
    ':::theorem[**A title**]{#result}\nStatement.\n:::\n\n:::proof\nArgument.\n:::',
  );
  assert.match(
    output,
    /<section class="environment environment-theorem" id="result">/,
  );
  assert.match(output, /Theorem — <strong>A title<\/strong>/);
  assert.match(output, /environment-proof/);
  assert.match(output, /aria-hidden="true">□/);
});
test('renders nested directives, inline and display math, and shared macros', async () => {
  const output = await html(
    '::::note\n:::lemma\n$x \\in \\RR$\n\n$$\nx^2\n$$\n:::\n::::',
  );
  assert.match(output, /environment-note/);
  assert.match(output, /environment-lemma/);
  assert.match(output, /class="katex"/);
  assert.match(output, /katex-display/);
  assert.doesNotMatch(output, /katex-error/);
});
test('renders an illustration and its caption as a semantic figure', async () => {
  const output = await html(
    ':::figure[A **caption**]{#diagram}\n![Description](./diagram.svg)\n:::',
  );
  assert.match(
    output,
    /<figure class="environment environment-figure" id="diagram">/,
  );
  assert.match(output, /<img src="\.\/diagram.svg" alt="Description">/);
  assert.match(output, /<figcaption>A <strong>caption<\/strong><\/figcaption>/);
});
test('reports unknown directives, invalid attributes, and duplicate IDs', async () => {
  await assert.rejects(
    html(':::theroem\nTypo.\n:::'),
    /Unknown directive "theroem"/,
  );
  await assert.rejects(
    html(':::note{onclick="alert(1)"}\nText.\n:::'),
    /Unsupported note attribute/,
  );
  await assert.rejects(
    html(':::note{#same}\nText.\n:::\n\n:::note{#same}\nText.\n:::'),
    /Duplicate directive ID/,
  );
  await assert.rejects(html('::note[Text]'), /Use :::note/);
});
test('post metadata rejects missing fields, invalid dates and unsafe slugs', () => {
  const valid = {
    title: 'A note',
    description: 'Description',
    pubDate: '2026-10-07',
  };
  assert.equal(postSchema.parse(valid).draft, false);
  assert.equal(postSchema.parse({ ...valid, draft: true }).draft, true);
  assert.equal(postSchema.safeParse({ ...valid, title: '' }).success, false);
  assert.equal(
    postSchema.safeParse({ ...valid, pubDate: 'invalid' }).success,
    false,
  );
  assert.equal(
    postSchema.safeParse({ ...valid, updatedDate: '2025-01-01' }).success,
    false,
  );
  assert.equal(
    postSchema.safeParse({ ...valid, slug: '../escape' }).success,
    false,
  );
  assert.equal(
    postSchema.safeParse({ ...valid, tags: ['../escape'] }).success,
    false,
  );
});

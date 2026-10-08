import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import environments from './environments.ts';
import { mathMacros } from './math-macros.ts';
import { postSchema } from '../lib/post-schema.ts';

async function html(markdown: string) {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkCjkFriendly)
      .use(remarkDirective)
      .use(remarkMath)
      .use(environments)
      .use(remarkRehype)
      .use(rehypeKatex, { macros: { ...mathMacros } })
      .use(rehypeStringify)
      .process(markdown),
  );
}

test('renders CJK emphasis around punctuation, links, and math without changing literals', async () => {
  const output = await html(
    String.raw`
- **环（Ring）**是由元素集合和运算组成。

中文**（说明）**继续。

遵守**[三五零原则](https://example.com/rules)**，以及**$x^2$（公式）**的写法。

\*\*环（Ring）\*\*是原样显示。

` + '`**环（Ring）**`',
  );
  assert.match(output, /<li><strong>环（Ring）<\/strong>是由/);
  assert.match(output, /中文<strong>（说明）<\/strong>继续/);
  assert.match(
    output,
    /<strong><a href="https:\/\/example.com\/rules">三五零原则<\/a><\/strong>/,
  );
  assert.match(output, /<strong><span class="katex">/);
  assert.match(output, /（公式）<\/strong>的写法/);
  assert.match(output, /<p>\*\*环（Ring）\*\*是原样显示。<\/p>/);
  assert.match(output, /<code>\*\*环（Ring）\*\*<\/code>/);
});

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
test('renders matrices, aligned equations, colors, and local math macros', async () => {
  const output = await html(String.raw`
$\color{red}{x} \in \RR$

$$
\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}
$$

$$
\newcommand\lfl{\left\lfloor}
\begin{aligned}
f(n) &= \lfl n/2 \right\rfloor \\
g(n) &= n^2
\end{aligned}
$$
`);
  assert.doesNotMatch(output, /katex-error/);
  assert.match(output, /mtable/);
  assert.match(output, /color:red/);
  assert.deepEqual(Object.keys(mathMacros), ['\\RR', '\\NN', '\\ZZ', '\\QQ']);
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

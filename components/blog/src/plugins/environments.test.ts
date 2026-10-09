import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
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
test('renders four open callout types with icons and accessible names instead of visible prefixes', async () => {
  const kinds = ['info', 'success', 'warning', 'error'];
  const paths = new Set<string>();
  for (const kind of kinds) {
    const $ = load(
      await html(`:::${kind}[Custom title]{#${kind}-example}\nBody.\n:::`),
    );
    const details = $(`details.environment-${kind}`);
    assert.equal(details.attr('id'), `${kind}-example`);
    assert(details.is('[open]'));
    const summary = details.children('summary');
    assert.equal(summary.children('strong').text(), 'Custom title');
    const icon = summary.children('svg.environment-icon');
    assert.equal(icon.attr('aria-hidden'), 'true');
    assert.equal(icon.attr('focusable'), 'false');
    assert.equal(icon.find('path').length, 1);
    paths.add(icon.find('path').attr('d')!);
    const label = summary.children('.visually-hidden');
    assert.equal(label.attr('data-i18n'), `environment.${kind}`);
    assert(label.text().length > 0);
    assert.equal(details.children('p').text(), 'Body.');
  }
  assert.equal(paths.size, kinds.length);
});
test('keeps title-less callouts accessible and preserves formatted custom titles', async () => {
  const $ = load(
    await html(
      ':::info\nInformation without a title.\n:::\n\n' +
        ':::success[**Correct** $x \\in \\RR$ and [proof](#proof)]\nBody.\n:::',
    ),
  );
  const bare = $('.environment-info > summary');
  assert.equal(bare.children('.visually-hidden').text(), 'Information');
  assert.equal(bare.children('strong').length, 0);
  assert.equal(bare.children('svg').length, 1);
  const title = $('.environment-success > summary > strong');
  assert.equal(title.children('strong').text(), 'Correct');
  assert.equal(title.find('.katex').length, 1);
  assert.equal(title.children('a').attr('href'), '#proof');
  assert.equal($('.katex-error').length, 0);
});
test('renders nested directives, inline and display math, and shared macros', async () => {
  const output = await html(
    '::::info\n:::lemma\n$x \\in \\RR$\n\n$$\nx^2\n$$\n:::\n::::',
  );
  assert.match(output, /environment-info/);
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
    html(':::info{onclick="alert(1)"}\nText.\n:::'),
    /Unsupported info attribute/,
  );
  await assert.rejects(
    html(':::info{#same}\nText.\n:::\n\n:::info{#same}\nText.\n:::'),
    /Duplicate directive ID/,
  );
  await assert.rejects(html('::info[Text]'), /Use :::info/);
  for (const legacy of ['note', 'tip'])
    await assert.rejects(
      html(`:::${legacy}\nText.\n:::`),
      new RegExp(`Unknown directive "${legacy}"`),
    );
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

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
import references from './references.ts';
import environments from './environments.ts';

function processor() {
  return unified()
    .use(remarkParse)
    .use(remarkCjkFriendly)
    .use(remarkDirective)
    .use(remarkMath)
    .use(references)
    .use(environments)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeStringify);
}

async function html(markdown: string) {
  return String(await processor().process(markdown));
}

test('resolves forward, grouped, and repeated citations in definition order', async () => {
  const $ = load(
    await html(`
First [@other2025]. Together [@something2024, @other2025]. Again [@other2025].

:::reference
- [@something2024] An article from 2024.
- [@other2025] An article from 2025.
:::
`),
  );
  assert.deepEqual(
    $('.citation')
      .map((_, node) => $(node).text())
      .get(),
    ['[2]', '[1, 2]', '[2]'],
  );
  assert.deepEqual(
    $('.citation a')
      .map((_, node) => $(node).attr('href'))
      .get(),
    [
      '#reference-other2025',
      '#reference-something2024',
      '#reference-other2025',
      '#reference-other2025',
    ],
  );
  assert.equal($('.environment-reference > .environment-title').length, 0);
  assert.equal($('.reference-list').prop('tagName'), 'OL');
  assert.deepEqual(
    $('.reference-list > li')
      .map((_, node) => $(node).text())
      .get(),
    ['\nAn article from 2024.\n', '\nAn article from 2025.\n'],
  );
  for (const link of $('.citation a')) {
    const target = decodeURIComponent($(link).attr('href')!.slice(1));
    assert.equal($(`[id="${target}"]`).length, 1);
  }
});

test('preserves rich reference descriptions and continues numbering across lists', async () => {
  const $ = load(
    await html(`
See [@author:2024, @other-2025.v2].

:::reference[Further reading]{#reading}
- [@author:2024] **Author（2024）**. [An article](https://example.com/article).

  A second paragraph with $x^2$.

  - A nested detail.
:::

:::reference
- [@other-2025.v2] Another article; see [@author:2024].
:::
`),
  );
  assert.equal($('#reading > .environment-title').text(), 'Further reading');
  assert.equal($('#reading .reference-entry strong').text(), 'Author（2024）');
  assert.equal(
    $('#reading .reference-entry a').attr('href'),
    'https://example.com/article',
  );
  assert.equal($('#reading .katex').length, 1);
  assert.equal($('#reading .reference-entry ul li').text(), 'A nested detail.');
  assert.deepEqual(
    $('.reference-list')
      .map((_, node) => $(node).attr('start') ?? '1')
      .get(),
    ['1', '2'],
  );
  assert.equal(
    $('.citation a').first().attr('href'),
    '#reference-author%3A2024',
  );
});

test('supports citations in formatted text and nested environments', async () => {
  const $ = load(
    await html(`
::::info
**See [@article] for details.**

:::reference
- [@article] An article.
:::
::::
`),
  );
  assert.equal($('.environment-info strong .citation').text(), '[1]');
  assert.equal($('.environment-info .reference-entry').length, 1);
});

test('keeps code, math, escapes, and ordinary Markdown links intact', async () => {
  const $ = load(
    await html(
      [
        '`[@missing]`',
        '```text\n[@missing, @another]\n```',
        String.raw`\[@missing] and &#91;@missing]`,
        '$[@missing]$',
        '[@missing](https://example.com/direct)',
        '[@missing][target]',
        '[A label containing [@missing]](https://example.com/nested)',
        '[target]: https://example.com/reference',
      ].join('\n\n'),
    ),
  );
  assert.equal($('.citation').length, 0);
  assert.equal($('code').first().text(), '[@missing]');
  assert.equal($('pre code').text().trim(), '[@missing, @another]');
  assert.equal($('.katex').length, 1);
  assert.deepEqual(
    $('a')
      .map((_, node) => $(node).text())
      .get(),
    ['@missing', '@missing', 'A label containing [@missing]'],
  );
});

test('reports missing, duplicate, empty, and malformed definitions', async () => {
  for (const [markdown, message] of [
    ['See [@missing].', /Unknown reference "missing"/],
    [
      ':::reference\n- [@same] First.\n- [@same] Second.\n:::',
      /Duplicate reference "same"/,
    ],
    [':::reference\n- [@empty]\n:::', /needs a description/],
    [':::reference\n:::', /at least one entry/],
    [':::reference\nPlain paragraph.\n:::', /Use - \[@key\]/],
    [':::reference\n1. [@key] Ordered.\n:::', /Use - \[@key\]/],
    [':::reference\n- Unkeyed entry.\n:::', /exactly one \[@key\]/],
    [
      ':::reference\n- [@one, @two] Grouped definition.\n:::',
      /exactly one \[@key\]/,
    ],
    ['::reference[Entry]', /Use :::reference/],
  ] as const) {
    await assert.rejects(html(markdown), message);
  }
});

test('keeps reference keys scoped to each article with a reused processor', async () => {
  const render = processor();
  await render.process('See [@local].\n\n:::reference\n- [@local] First.\n:::');
  await assert.rejects(
    render.process('See [@local].'),
    /Unknown reference "local"/,
  );
  const $ = load(
    String(
      await render.process(
        'See [@local].\n\n:::reference\n- [@local] Second.\n:::',
      ),
    ),
  );
  assert.equal($('.citation').text(), '[1]');
  assert.equal($('.reference-entry').text().trim(), 'Second.');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import codeBlocks from './code-blocks.ts';

const renderer = await createMarkdownProcessor({
  shikiConfig: {
    themes: { light: 'github-light', dark: 'github-dark' },
    transformers: [codeBlocks],
  },
});

test('adds language headers and line numbers without changing highlighted code', async () => {
  const source = 'int main() {\n\tint x = 1;\n\n\t\treturn x;\n}';
  const $ = load((await renderer.render('```cpp\n' + source + '\n```')).code);
  assert.equal($('.code-block').length, 1);
  assert.equal($('.code-language').text(), 'C++');
  assert.equal($('.code-block pre > code').text(), source);
  assert.equal($('.code-line-numbers').attr('aria-hidden'), 'true');
  assert.equal($('.code-line-numbers').text(), '');
  assert.deepEqual(
    $('.code-line-number')
      .map((_, node) => $(node).attr('data-line'))
      .get(),
    ['1', '2', '3', '4', '5'],
  );
  assert.equal($('.code-copy').attr('type'), 'button');
  assert.equal($('.code-copy').attr('aria-label'), 'Copy code');
  assert($('.code-copy').is('[hidden]'));
  assert.equal($('.code-copy svg[aria-hidden="true"]').length, 2);
  assert($('.line [style*="--shiki-dark"]').length > 0);
});

test('numbers each block independently and handles plain, empty, and inline code', async () => {
  const $ = load(
    (
      await renderer.render(
        [
          '`inline code`',
          '```plain\nfirst\nsecond\n```',
          '```\nplain source\n```',
          '```makefile\n```',
        ].join('\n\n'),
      )
    ).code,
  );
  assert.deepEqual(
    $('.code-language')
      .map((_, node) => $(node).text())
      .get(),
    ['Plain text', 'Plain text', 'Makefile'],
  );
  assert.deepEqual(
    $('.code-line-numbers')
      .map((_, node) => $(node).children().length)
      .get(),
    [2, 1, 1],
  );
  assert.deepEqual(
    $('.code-line-numbers > :first-child')
      .map((_, node) => $(node).attr('data-line'))
      .get(),
    ['1', '1', '1'],
  );
  assert.equal($('p > code').text(), 'inline code');
  assert.equal($('p > code').find('span, button').length, 0);
});

test('keeps markup-looking code literal and preserves trailing blank lines', async () => {
  const source = '<script>alert("code")</script>\n\t<div>&amp;</div>\n\n';
  const $ = load((await renderer.render('```html\n' + source + '\n```')).code);
  assert.equal($('.code-block pre > code').text(), source);
  assert.equal($('.code-block script, .code-block code div').length, 0);
  assert.equal($('.code-line-number').length, source.split('\n').length);
});

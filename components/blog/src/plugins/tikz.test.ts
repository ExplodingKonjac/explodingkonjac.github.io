import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { load } from 'cheerio';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import environments from './environments.ts';
import tikz from './tikz.ts';

const fileURL = new URL(
  '../../content/posts/tikz-test/index.md',
  import.meta.url,
);
const renderer = await createMarkdownProcessor({
  remarkPlugins: [remarkDirective, environments, tikz],
});
const drawing = String.raw`\usetikzlibrary{arrows.meta,positioning}
% \begin{document} and \begin{tikzpicture} in comments are not environments.
\begin{tikzpicture}[node distance=2cm]
  \node[draw,circle] (a) {$x^2+\alpha$};
  \node[draw,circle,right=of a] (b) {$B$};
  \draw[-{Stealth}] (a) -- (b);
\end{tikzpicture}`;
const fence = (source: string, alt = '') =>
  `\`\`\`tikz ${alt}\n${source}\n\`\`\``;

test('compiles TikZ and libraries into a self-contained local SVG inside a figure', async () => {
  const result = await renderer.render(
    `:::figure[An edge]\n${fence(drawing, 'Two connected nodes')}\n:::`,
    { fileURL },
  );
  assert.equal(result.metadata.localImagePaths.length, 1);
  const html = load(result.code);
  assert.equal(html('figure > p > img').length, 1);
  assert.equal(html('figcaption').text(), 'An edge');
  assert.equal(html('pre, script').length, 0);
  const image = JSON.parse(html('img').attr('__astro_image_')!);
  assert.equal(image.alt, 'Two connected nodes');
  const svg = await readFile(new URL(image.src, fileURL), 'utf8');
  const $ = load(svg, { xmlMode: true });
  assert($('path').length > 0);
  assert($('text').length > 0);
  for (const element of $('[font-family]').toArray())
    assert(
      $('style')
        .text()
        .includes(`font-family:${$(element).attr('font-family')};`),
    );
  assert.match($('style').text(), /data:font\/ttf;base64,/);
  assert.doesNotMatch(svg, /@import|https?:\/\/(?!www\.w3\.org)/);
  assert.equal($('svg > rect').first().attr('fill'), 'white');
  assert(Number($('svg').attr('width')) > 0);
  assert(Number($('svg').attr('height')) > 0);
});

test('reuses generated assets for identical fences and preserves ordinary code', async () => {
  const source = fence(drawing);
  const first = await renderer.render(source, { fileURL });
  const asset = new URL(first.metadata.localImagePaths[0]!, fileURL);
  const before = await stat(asset);
  const result = await renderer.render(
    `${source}\n\n${source}\n\n\`\`\`js\nconst n = 1;\n\`\`\``,
    {
      fileURL,
    },
  );
  assert.deepEqual(
    result.metadata.localImagePaths,
    first.metadata.localImagePaths,
  );
  assert.equal((await stat(asset)).mtimeMs, before.mtimeMs);
  const $ = load(result.code);
  assert.equal($('img').length, 2);
  assert.equal($('pre code').text(), 'const n = 1;');
});

test('reports invalid TeX at the Markdown block and recovers for subsequent diagrams', async () => {
  await assert.rejects(
    renderer.render(`Intro\n\n${fence(String.raw`\notARealTikzCommand`)}`, {
      fileURL,
    }),
    (error: Error & { line?: number }) => {
      assert.match(error.message, /Cannot render TikZ/);
      assert.match(error.message, /Undefined control sequence/);
      assert.equal(error.line, 3);
      return true;
    },
  );
  const result = await renderer.render(
    fence(String.raw`\draw (0,0) circle (1);`),
    { fileURL },
  );
  const svg = await readFile(
    new URL(result.metadata.localImagePaths[0]!, fileURL),
    'utf8',
  );
  assert(load(svg, { xmlMode: true })('path').length > 0);
});

test('rejects empty diagrams instead of silently showing source code', async () => {
  await assert.rejects(
    renderer.render(fence(''), { fileURL }),
    /TikZ code block is empty/,
  );
});

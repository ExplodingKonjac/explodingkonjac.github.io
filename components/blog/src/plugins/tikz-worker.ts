import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';

const require = createRequire(import.meta.url);
const { default: tex2svg } =
  require('node-tikzjax') as typeof import('node-tikzjax');
const fonts = join(
  dirname(require.resolve('node-tikzjax/package.json')),
  'css/bakoma/ttf',
);
const errors: string[] = [];
const log: string[] = [];
// Some TeX errors still produce DVI. Treat those as build errors too.
console.log = (...args: unknown[]) => {
  const line = args.join(' ');
  if (line.startsWith('!')) errors.push(line);
  log.push(line);
  if (log.length > 80) log.shift();
};

try {
  let source = '';
  for await (const chunk of process.stdin) source += chunk;
  // Ignore commented-out environments while preserving source offsets.
  const code = source.replace(/\\[%\\]|%[^\r\n]*/g, (match) =>
    match.startsWith('%') ? ' '.repeat(match.length) : match,
  );
  if (!code.includes('\\begin{document}')) {
    const picture = code.indexOf('\\begin{tikzpicture}');
    source =
      picture < 0
        ? `\\begin{document}\n\\begin{tikzpicture}\n${source}\n\\end{tikzpicture}\n\\end{document}`
        : `${source.slice(0, picture)}\n\\begin{document}\n${source.slice(picture)}\n\\end{document}`;
  }
  const svg = await tex2svg(`\\nonstopmode\n${source}`, { showConsole: true });
  if (errors.length) throw new Error(errors.join('\n'));
  const $ = load(svg, { xmlMode: true });
  const root = $('svg');
  const box = root.attr('viewBox')?.split(/\s+/).map(Number);
  if (
    root.length !== 1 ||
    !box ||
    box.length !== 4 ||
    !box.every(Number.isFinite)
  )
    throw new Error('The TeX compiler did not produce a valid SVG');
  const [x, y, width, height] = box;
  if (width <= 0 || height <= 0) throw new Error('The TikZ diagram is empty');

  // SVGs used as images cannot load external fonts. Embed the bundled TeX
  // fonts actually used by the diagram, including their math glyph mappings.
  const families = new Set(
    $('[font-family]')
      .map((_, element) => $(element).attr('font-family'))
      .get(),
  );
  const rules = [];
  for (const family of families) {
    if (!/^[a-zA-Z0-9-]+$/.test(family))
      throw new Error(`Unsupported TikZ font: ${family}`);
    const font = await readFile(join(fonts, `${family}.ttf`));
    rules.push(
      `@font-face{font-family:${family};src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype')}`,
    );
  }
  root.prepend(`<defs><style>${rules.join('')}</style></defs>`);

  // Keep black TeX labels readable in both themes and inside the lightbox.
  const padding = 8;
  const padded = [
    x - padding,
    y - padding,
    width + 2 * padding,
    height + 2 * padding,
  ];
  root.attr('viewBox', padded.join(' '));
  root.attr('width', String((padded[2] * 4) / 3));
  root.attr('height', String((padded[3] * 4) / 3));
  root.prepend(
    `<rect x="${padded[0]}" y="${padded[1]}" width="${padded[2]}" height="${padded[3]}" fill="white"/>`,
  );
  process.stdout.write($.xml());
} catch (error) {
  process.stderr.write(
    `${errors.length ? errors.join('\n') : error instanceof Error ? error.message : String(error)}\n${log.slice(-15).join('\n')}`,
  );
  process.exitCode = 1;
}

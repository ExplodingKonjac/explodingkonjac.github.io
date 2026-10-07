import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { load } from 'cheerio';

const file = process.argv[2];
const $ = load(await readFile(file, 'utf8'));
if (!$('title').text() || !$('meta[name="viewport"]').length)
  throw new Error(`${file}: missing title or viewport`);
$('script:not([src])').each((index, element) => {
  const type = $(element).attr('type');
  if (!type || type === 'text/javascript')
    new Script($(element).text(), { filename: `${file}:script-${index}` });
});
console.log(`${file}: HTML and inline script syntax OK`);

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { components } from './components.mjs';
import { site } from '../components/home/site.mjs';
import { repoRoot } from './assemble.mjs';

async function pages(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...(await pages(root, file)));
    else if (/\.(html|xml|css)$/.test(file)) files.push(file);
  }
  return files;
}

export async function verifySite(root = path.join(repoRoot, '_site')) {
  const errors = [];
  const blogRoot = components
    .find((entry) => entry.id === 'blog')
    .mount.slice(1);
  const documents = new Map();
  const ids = new Map();
  async function checkLink(reference, source) {
    if (
      !reference ||
      reference === '#' ||
      /^(?:data:|mailto:|tel:|javascript:)/i.test(reference)
    )
      return;
    const sourceUrl = `/${source.replace(/index\.html$/, '')}`;
    const url = new URL(reference, new URL(sourceUrl, site.origin));
    if (url.origin !== site.origin) return;
    let file = decodeURIComponent(url.pathname).slice(1);
    if (file.endsWith('/') || !file) file += 'index.html';
    const target = path.resolve(root, file);
    if (!target.startsWith(`${root}${path.sep}`)) {
      errors.push(`${source}: unsafe URL ${reference}`);
      return;
    }
    if (!(await stat(target).catch(() => null))?.isFile()) {
      errors.push(`${source}: missing ${reference}`);
      return;
    }
    if (url.hash && file.endsWith('.html')) {
      if (!ids.has(file)) {
        const $ = load(await readFile(target, 'utf8'));
        ids.set(
          file,
          new Set(
            $('[id]')
              .map((_, element) => $(element).attr('id'))
              .get(),
          ),
        );
      }
      if (!ids.get(file).has(decodeURIComponent(url.hash.slice(1))))
        errors.push(`${source}: missing anchor ${reference}`);
    }
  }
  for (const file of await pages(root)) {
    const text = await readFile(path.join(root, file), 'utf8');
    documents.set(file, text);
    if (file.endsWith('.css')) {
      for (const match of text.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g))
        await checkLink(match[1], file);
      continue;
    }
    const $ = load(text, { xmlMode: file.endsWith('.xml') });
    if (file.endsWith('.html')) {
      const seen = new Set();
      $('[id]').each((_, element) => {
        const id = $(element).attr('id');
        if (seen.has(id)) errors.push(`${file}: duplicate ID ${id}`);
        seen.add(id);
      });
      ids.set(file, seen);
      const references = [];
      $('[href], [src]').each((_, element) => {
        for (const attribute of ['href', 'src'])
          if ($(element).attr(attribute))
            references.push($(element).attr(attribute));
      });
      $('[srcset]').each((_, element) => {
        for (const candidate of $(element).attr('srcset').split(','))
          references.push(candidate.trim().split(/\s+/)[0]);
      });
      for (const reference of references) await checkLink(reference, file);
      if (
        file.startsWith(blogRoot) &&
        $('meta[name="robots"]').attr('content')?.includes('noindex')
      )
        errors.push(`${file}: draft page in production output`);
      if ($('.katex-error').length) errors.push(`${file}: invalid math`);
      if (
        file !== '404.html' &&
        !$('link[rel="canonical"]').length &&
        !file.startsWith('app/')
      )
        errors.push(`${file}: missing canonical URL`);
    } else {
      for (const element of $('loc, link').toArray())
        await checkLink($(element).text(), file);
    }
  }
  for (const entry of components) await checkLink(entry.mount, 'index.html');
  for (const file of [
    `${blogRoot}rss.xml`,
    `${blogRoot}sitemap-index.xml`,
    `${blogRoot}search/index.html`,
    `${blogRoot}search-index.json`,
    '404.html',
    'robots.txt',
  ]) {
    if (!(await stat(path.join(root, file)).catch(() => null))?.isFile())
      errors.push(`Missing required artifact: ${file}`);
  }
  if (errors.length)
    throw new Error(`Production verification failed:\n${errors.join('\n')}`);
  return documents.size;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    `Verified ${await verifySite()} HTML, XML, and CSS artifacts; internal links and assets resolve.`,
  );
}

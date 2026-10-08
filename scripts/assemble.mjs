import { cp, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { components } from './components.mjs';
import { site } from '../components/home/site.mjs';
import { absoluteUrl, blogUrl } from '../components/blog/src/config/site.mjs';

export const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export function validateRegistry(registry) {
  if (registry.filter((entry) => entry.mount === '/').length !== 1)
    throw new Error('Exactly one root component is required');
  for (const key of ['id', 'package', 'directory', 'mount']) {
    if (new Set(registry.map((entry) => entry[key])).size !== registry.length)
      throw new Error(`Duplicate component ${key}`);
  }
  for (const entry of registry) {
    if (!/^\/(?:[a-z0-9-]+\/)*$/.test(entry.mount))
      throw new Error(`Invalid mount: ${entry.mount}`);
    if (!/^components\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(entry.directory))
      throw new Error(`Invalid component directory: ${entry.directory}`);
  }
  const mounts = registry
    .filter((entry) => entry.mount !== '/')
    .map((entry) => entry.mount);
  for (const mount of mounts) {
    if (mounts.some((other) => mount !== other && mount.startsWith(other)))
      throw new Error(`Overlapping mounts: ${mount}`);
  }
}

async function walk(directory, prefix = '') {
  const entries = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, item.name);
    if (item.isSymbolicLink())
      throw new Error(`Symlink in build output: ${relative}`);
    if (item.isDirectory()) {
      entries.push({ relative, directory: true });
      entries.push(...(await walk(path.join(directory, item.name), relative)));
    } else if (item.isFile()) entries.push({ relative, directory: false });
    else throw new Error(`Unsupported output entry: ${relative}`);
  }
  return entries;
}

function escape(text) {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
}

function notFound(registry) {
  const links = registry
    .map(
      (entry) => `<li><a href="${entry.mount}">${escape(entry.title)}</a></li>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found · ${escape(site.name)}</title><style>body{font:18px/1.7 system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:24px;background:#f6f5f0;color:#202e34}a{color:#176c5b}a:focus-visible{outline:3px solid currentColor;outline-offset:4px}h1{line-height:1.2}</style></head><body><main><p>404 / PAGE NOT FOUND</p><h1>This page isn't here.</h1><p>Try one of these places instead.</p><ul>${links}</ul></main></body></html>`;
}

/** Validate all outputs before replacing the disposable assembled directory. */
export async function assemble(root = repoRoot, registry = components) {
  validateRegistry(registry);
  const output = path.join(root, '_site');
  const files = new Set(['404.html', 'robots.txt', '.nojekyll']);
  const reserved = registry
    .filter((entry) => entry.mount !== '/')
    .map((entry) => entry.mount.slice(1, -1));
  const builds = [];
  for (const entry of [...registry].sort(
    (a, b) => Number(b.mount === '/') - Number(a.mount === '/'),
  )) {
    const source = path.join(root, entry.directory, 'dist');
    if (!(await lstat(source).catch(() => null))?.isDirectory()) {
      throw new Error(
        `Missing or unsafe build output directory: ${entry.package}`,
      );
    }
    const index = path.join(source, 'index.html');
    if (!(await lstat(index).catch(() => null))?.isFile())
      throw new Error(`Missing build output: ${entry.package} (${index})`);
    const entries = await walk(source);
    for (const item of entries) {
      if (
        entry.mount === '/' &&
        reserved.some(
          (mount) =>
            item.relative === mount ||
            item.relative.startsWith(`${mount}/`) ||
            (!item.directory && mount.startsWith(`${item.relative}/`)),
        )
      ) {
        throw new Error(
          `Homepage output occupies reserved subtree: ${item.relative}`,
        );
      }
      const destination = path.posix.join(entry.mount.slice(1), item.relative);
      if (item.directory) {
        if (files.has(destination))
          throw new Error(`Output collision: ${destination}`);
      } else {
        if (files.has(destination))
          throw new Error(`Output collision: ${destination}`);
        const ancestors = destination.split('/');
        ancestors.pop();
        while (ancestors.length) {
          if (files.has(ancestors.join('/')))
            throw new Error(`Output collision: ${destination}`);
          ancestors.pop();
        }
        files.add(destination);
      }
    }
    builds.push({
      source,
      destination: path.join(output, entry.mount.slice(1)),
    });
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const build of builds)
    await cp(build.source, build.destination, { recursive: true });
  await writeFile(path.join(output, '404.html'), notFound(registry));
  await writeFile(path.join(output, '.nojekyll'), '');
  await writeFile(
    path.join(output, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${absoluteUrl(blogUrl('sitemap-index.xml'))}\n`,
  );
  return output;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(`Assembled site: ${await assemble()}`);
}

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { repoRoot } from './assemble.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

export function previewServer(root = path.join(repoRoot, '_site')) {
  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405);
        response.end();
        return;
      }
      const url = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(`${root}${path.sep}`) && file !== root) {
        response.writeHead(403);
        response.end();
        return;
      }
      let target = file;
      const info = await stat(target).catch(() => null);
      if (info?.isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.writeHead(301, {
            Location: `${url.pathname}/${url.search}`,
          });
          response.end();
          return;
        }
        target = path.join(target, 'index.html');
      }
      const data = await readFile(target).catch(() => null);
      const status = data ? 200 : 404;
      const body = data ?? (await readFile(path.join(root, '404.html')));
      response.writeHead(status, {
        'Content-Type': data
          ? (mime[path.extname(target)] ?? 'application/octet-stream')
          : mime['.html'],
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
    }
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex === -1 ? 4173 : Number(process.argv[portIndex + 1]);
  await stat(path.join(repoRoot, '_site', 'index.html'));
  previewServer().listen(port, '127.0.0.1', () =>
    console.log(`Production preview: http://127.0.0.1:${port}`),
  );
}

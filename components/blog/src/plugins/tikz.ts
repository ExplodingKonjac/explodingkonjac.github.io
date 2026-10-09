import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visit } from 'unist-util-visit';
import type { Code, Root } from 'mdast';
import type { Plugin } from 'unified';

const worker = fileURLToPath(new URL('./tikz-worker.ts', import.meta.url));
const cache = fileURLToPath(new URL('../../.cache/tikz/', import.meta.url));
const require = createRequire(import.meta.url);
const compilerVersion = require('node-tikzjax/package.json').version as string;
const rendererKey = compilerVersion + readFileSync(worker, 'utf8');
const pending = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function compile(source: string): Promise<string> {
  const hash = createHash('sha256')
    .update(rendererKey)
    .update(source)
    .digest('hex');
  const existing = pending.get(hash);
  if (existing) return existing;

  // TikZJax has a global TeX engine. Isolate jobs and bound their runtime;
  // serialize them to keep memory use predictable when many posts render.
  const job = queue.then(async () => {
    const target = `${cache}/${hash}.svg`;
    try {
      await access(target);
      return target;
    } catch {
      // First render of this source (or of a new compiler version).
    }
    const svg = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [worker],
        { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error)
            reject(
              new Error(
                error.killed
                  ? 'TikZ compilation exceeded 30 seconds'
                  : stderr.trim() || error.message,
              ),
            );
          else resolve(stdout);
        },
      );
      child.stdin?.on('error', reject);
      child.stdin?.end(source);
    });
    await mkdir(cache, { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, svg);
    await rename(temporary, target);
    return target;
  });
  pending.set(hash, job);
  queue = job.catch(() => pending.delete(hash));
  return job;
}

/** Compile fenced TikZ before highlighting; let Astro publish the local SVG. */
const tikz: Plugin<[], Root> = () => async (tree, file) => {
  const blocks: { node: Code; replace: (path: string) => void }[] = [];
  visit(tree, 'code', (node, index, parent) => {
    if (node.lang !== 'tikz' || index === undefined || !parent) return;
    blocks.push({
      node,
      replace: (path) => {
        parent.children[index] = {
          type: 'paragraph',
          position: node.position,
          children: [
            {
              type: 'image',
              url: relative(dirname(file.path), path).split(sep).join('/'),
              alt: node.meta?.trim() || 'TikZ diagram',
            },
          ],
        };
      },
    });
  });
  for (const { node, replace } of blocks) {
    if (!file.path)
      file.fail('TikZ requires a Markdown source file path', node);
    if (!node.value.trim()) file.fail('TikZ code block is empty', node);
    try {
      replace(await compile(node.value));
    } catch (error) {
      file.fail(
        `Cannot render TikZ: ${error instanceof Error ? error.message : String(error)}`,
        node,
      );
    }
  }
};

export default tikz;

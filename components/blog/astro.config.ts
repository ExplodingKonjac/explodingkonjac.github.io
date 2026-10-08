import { defineConfig } from 'astro/config';
import { unified, rehypeHeadingIds } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { visit } from 'unist-util-visit';
import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { site } from './src/config/site.ts';
import environments from './src/plugins/environments.ts';
import { mathMacros } from './src/plugins/math-macros.ts';

const headingLinks: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'element', (node) => {
    if (!/^h[2-6]$/.test(node.tagName) || !node.properties.id) return;
    node.children.push({
      type: 'element',
      tagName: 'a',
      properties: {
        href: `#${node.properties.id}`,
        className: ['heading-anchor'],
        ariaLabel: 'Link to this heading',
        'data-i18n-aria': 'heading.link',
      },
      children: [{ type: 'text', value: '#' }],
    });
  });
};

export default defineConfig({
  site: site.origin,
  base: site.base,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { server: { strictPort: true, hmr: false, ws: false, watch: null } },
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkDirective, remarkMath, environments],
      rehypePlugins: [
        [
          rehypeKatex,
          // KaTeX temporarily adds macros when rendering arrays and colors.
          { macros: { ...mathMacros }, throwOnError: true, strict: 'error' },
        ],
        rehypeHeadingIds,
        headingLinks,
      ],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});

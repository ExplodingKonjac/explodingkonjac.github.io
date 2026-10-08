import { defineConfig } from 'astro/config';
import { unified, rehypeHeadingIds } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { site } from './src/config/site.mjs';
import environments from './src/plugins/environments.mjs';
import headingLinks from './src/plugins/heading-links.mjs';
import { mathMacros } from './src/plugins/math-macros.mjs';

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
          { macros: mathMacros, throwOnError: true, strict: 'error' },
        ],
        rehypeHeadingIds,
        headingLinks,
      ],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});

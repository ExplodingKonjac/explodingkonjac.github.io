import { defineConfig } from 'vite';
import { site, projects } from './site.mjs';

function escape(text) {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
}

export default defineConfig({
  base: '/',
  appType: 'mpa',
  server: {
    strictPort: true,
    hmr: false,
    ws: false,
    watch: null,
  },
  plugins: [
    {
      name: 'personal-hub',
      transformIndexHtml(html) {
        const links = projects
          .map(
            (entry, index) =>
              `<a class="project" href="${escape(entry.href)}"><span class="project-number">0${index + 1}</span><div><h2>${escape(entry.title)}</h2><p>${escape(entry.description)}</p></div><span aria-hidden="true" class="arrow">↗</span></a>`,
          )
          .join('');
        return html
          .replaceAll('%SITE_NAME%', escape(site.name))
          .replaceAll('%SITE_DESCRIPTION%', escape(site.description))
          .replaceAll('%SITE_GITHUB%', site.github)
          .replaceAll('%SITE_CANONICAL%', new URL('/', site.origin).href)
          .replace('%HOME_URL%', '/')
          .replace('%BLOG_RSS%', '/blog/rss.xml')
          .replace('%COMPONENT_LINKS%', links);
      },
    },
  ],
});

import { defineConfig } from 'vite';
import {
  component,
  components,
  componentUrl,
  site,
  absoluteUrl,
} from '@site/config';

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
  base: component('home').mount,
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
        const links = components
          .filter((entry) => entry.id !== 'home')
          .map(
            (entry, index) =>
              `<a class="project" href="${componentUrl(entry.id)}"><span class="project-number">0${index + 1}</span><div><h2>${escape(entry.title)}</h2><p>${escape(entry.description)}</p></div><span aria-hidden="true" class="arrow">↗</span></a>`,
          )
          .join('');
        return html
          .replaceAll('%SITE_NAME%', escape(site.name))
          .replaceAll('%SITE_DESCRIPTION%', escape(site.description))
          .replaceAll('%SITE_GITHUB%', site.github)
          .replaceAll('%SITE_CANONICAL%', absoluteUrl('/'))
          .replace('%HOME_URL%', componentUrl('home'))
          .replace('%BLOG_RSS%', componentUrl('blog', 'rss.xml'))
          .replace('%COMPONENT_LINKS%', links);
      },
    },
  ],
});

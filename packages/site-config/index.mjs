export const site = Object.freeze({
  origin: 'https://explodingkonjac.github.io',
  name: 'ExplodingKonjac',
  description:
    'Notes on mathematics, algorithms, and technology. A place for things I build.',
  github: 'https://github.com/ExplodingKonjac',
});

export const components = Object.freeze([
  {
    id: 'home',
    package: '@site/home',
    directory: 'components/home',
    mount: '/',
    title: 'Home',
    description: 'A personal notebook and a collection of projects.',
  },
  {
    id: 'blog',
    package: '@site/blog',
    directory: 'components/blog',
    mount: '/blog/',
    title: 'Blog',
    description:
      'Mathematics, algorithms, and technology — worked through in writing.',
  },
  {
    id: 'maimai-renderer',
    package: '@site/maimai-renderer',
    directory: 'components/app/maimai-renderer',
    mount: '/app/maimai-renderer/',
    title: 'ORBIT · maimai renderer',
    description:
      'Explore chart playback, hand trajectories, and judgement results.',
  },
]);

/** @param {string} id */
export function component(id) {
  const entry = components.find((entry) => entry.id === id);
  if (!entry) throw new Error(`Unknown component: ${id}`);
  return entry;
}

/** Build an encoded component-relative URL; pass logical, unencoded segments.
 * @param {string} id
 * @param {...string} segments
 */
export function componentUrl(id, ...segments) {
  const suffix = segments
    .flatMap((segment) => segment.split('/'))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `${component(id).mount}${suffix}${suffix && !/\.[a-z0-9]+$/i.test(suffix) ? '/' : ''}`;
}

/** @param {string} path */
export function absoluteUrl(path) {
  return new URL(path, site.origin).href;
}

export const site = Object.freeze({
  origin: 'https://explodingkonjac.github.io',
  base: '/blog/',
  name: "ExplodingKonjac's Blog",
  github: 'https://github.com/ExplodingKonjac',
  description:
    'Notes on mathematics, algorithms, and technology. A place for things I build.',
});
/** Build a blog-relative URL; pass logical, unencoded segments.
 * @param {...string} segments
 */
export function blogUrl(...segments) {
  const suffix = segments
    .flatMap((segment) => segment.split('/'))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `${site.base}${suffix}${suffix && !/\.[a-z0-9]+$/i.test(suffix) ? '/' : ''}`;
}

/** @param {string} path */
export function absoluteUrl(path) {
  return new URL(path, site.origin).href;
}

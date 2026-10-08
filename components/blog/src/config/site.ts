export const site = Object.freeze({
  origin: 'https://explodingkonjac.github.io',
  base: '/blog/',
  name: "ExplodingKonjac's Blog",
  github: 'https://github.com/ExplodingKonjac',
  description:
    'Notes on mathematics, algorithms, and technology. A place for things I build.',
});
/** Build a blog-relative URL; pass logical, unencoded segments. */
export function blogUrl(...segments: string[]): string {
  const suffix = segments
    .flatMap((segment) => segment.split('/'))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `${site.base}${suffix}${suffix && !/\.[a-z0-9]+$/i.test(suffix) ? '/' : ''}`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, site.origin).href;
}

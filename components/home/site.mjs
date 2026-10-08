// Homepage content is independent of the blog's identity and deployment registry.
export const site = Object.freeze({
  origin: 'https://explodingkonjac.github.io',
  name: 'ExplodingKonjac',
  description:
    'Notes on mathematics, algorithms, and technology. A place for things I build.',
  github: 'https://github.com/ExplodingKonjac',
});

export const projects = Object.freeze([
  {
    href: '/blog/',
    title: 'Blog',
    description:
      'Mathematics, algorithms, and technology — worked through in writing.',
  },
  {
    href: '/app/maimai-renderer/',
    title: 'ORBIT · maimai renderer',
    description:
      'Explore chart playback, hand trajectories, and judgement results.',
  },
]);

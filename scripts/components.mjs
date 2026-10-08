import { site as blog } from '../components/blog/src/config/site.mjs';

// Deployment inputs only. Components own their content and framework settings.
// Titles label the recovery links on the root 404 page.
export const components = Object.freeze([
  {
    id: 'home',
    package: '@site/home',
    directory: 'components/home',
    mount: '/',
    title: 'Home',
  },
  {
    id: 'blog',
    package: '@site/blog',
    directory: 'components/blog',
    mount: blog.base,
    title: 'Blog',
  },
  {
    id: 'maimai-renderer',
    package: '@site/maimai-renderer',
    directory: 'components/app/maimai-renderer',
    mount: '/app/maimai-renderer/',
    title: 'ORBIT · maimai renderer',
  },
]);

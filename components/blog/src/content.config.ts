import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema } from './lib/post-schema';

const posts = defineCollection({
  loader: glob({
    pattern: '**/[^_]*.md',
    base: './content/posts',
    generateId: ({ entry, data }) =>
      typeof data.slug === 'string'
        ? data.slug
        : entry.replace(/(?:\/index)?\.md$/, '').replace(/\/index$/, ''),
  }),
  schema: postSchema,
});

export const collections = { posts };

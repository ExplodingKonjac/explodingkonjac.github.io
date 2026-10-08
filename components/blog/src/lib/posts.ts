import { getCollection, type CollectionEntry } from 'astro:content';
import { blogUrl } from '../config/site.mjs';

export async function publishedPosts() {
  return (
    await getCollection(
      'posts',
      ({ data }) => import.meta.env.DEV || !data.draft,
    )
  ).sort(
    (a, b) =>
      b.data.pubDate.valueOf() - a.data.pubDate.valueOf() ||
      a.id.localeCompare(b.id),
  );
}

export function postUrl(post: CollectionEntry<'posts'>) {
  return blogUrl('posts', post.id);
}

export function tagUrl(tag: string) {
  return blogUrl('tags', tag);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

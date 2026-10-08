import rss from '@astrojs/rss';
import { site, absoluteUrl, blogUrl } from '../config/site.ts';
import { publishedPosts, postUrl } from '../lib/posts';

export async function GET() {
  return rss({
    title: `${site.name}'s notebook`,
    description: site.description,
    site: absoluteUrl(blogUrl()),
    items: (await publishedPosts()).map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: absoluteUrl(postUrl(post)),
      categories: post.data.tags,
    })),
    customData: '<language>en</language>',
  });
}

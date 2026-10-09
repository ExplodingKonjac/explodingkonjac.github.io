import { load } from 'cheerio';
import { publishedPosts } from '../lib/posts';

export async function GET() {
  const posts = (await publishedPosts()).filter((post) => !post.data.draft);
  const entries = posts.map((post) => {
    if (!post.rendered)
      throw new Error(`Missing rendered search content: ${post.id}`);
    const $ = load(post.rendered.html);
    // KaTeX emits both accessible MathML and visual HTML. Keep one source form
    // instead of duplicating every symbol in searchable text and excerpts.
    $('.katex').each((_, element) => {
      const formula = $(element)
        .find('annotation[encoding="application/x-tex"]')
        .text();
      $(element).replaceWith($('<span></span>').text(formula));
    });
    $(
      'script, style, .heading-anchor, .katex-html, .footnote-backref, .code-block-header',
    ).remove();
    $('p, div, li, h1, h2, h3, h4, h5, h6, pre, tr, td, th, br, figcaption')
      .before(' ')
      .after(' ');
    return {
      id: post.id,
      title: post.data.title,
      summary: post.data.description,
      content: $.root().text().replace(/\s+/g, ' ').trim(),
    };
  });
  return new Response(JSON.stringify(entries), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

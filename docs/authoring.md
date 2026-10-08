# Writing a post

Create `components/blog/content/posts/your-post/index.md` and keep illustrations alongside it. The directory becomes `/blog/posts/your-post/`; nested directories work. Files beginning with `_` are templates and not loaded.

```yaml
---
title: A useful explanation
description: A concise summary for the index, feed, and social metadata.
pubDate: 2026-10-07
updatedDate: 2026-10-08 # Optional; cannot precede pubDate
tags: [mathematics, algorithms]
draft: true # Defaults to false
slug: a-useful-explanation # Optional, overrides the directory-derived URL
---
```

Use lowercase directory names and slugs with hyphens; explicit nested slugs use `category/post-name`. Tags allow letters (including Unicode), numbers, spaces, underscores and hyphens. Tags are case-sensitive; keep spelling consistent.

Run `pnpm dev` to build and serve the complete static site. After edits, run `pnpm build` and refresh the browser; there is no automatic reload. Drafts are excluded from this snapshot's routes, indexes, tags, RSS and sitemap. Remove `draft-example` when no longer useful. Future dates do not schedule publication.

## Math and environments

Use `$x \in \RR$` inline and separate `$$` blocks for display math. Shared macros are in `src/plugins/math-macros.mjs`: `\RR`, `\NN`, `\ZZ`, and `\QQ` are provided. Math renders at build time; fix invalid math detected by verification before publishing.

```markdown
:::theorem[Pythagorean theorem]{#pythagoras}
For a right triangle,

$$
a^2 + b^2 = c^2.
$$

:::

:::proof
Write the argument here.
:::

See [the theorem](#pythagoras).
```

Supported blocks: `theorem`, `lemma`, `proposition`, `corollary`, `definition`, `proof`, `remark`, `note`, `tip`, `warning`, and `figure`. Titles/IDs are optional. IDs start with an ASCII letter and contain letters, digits, underscores or hyphens. Keep IDs unique. Attributes other than IDs are unsupported; unknown directive names fail with a source location.

Use an extra colon on an outer block when nesting:

```markdown
::::note[An observation]
:::lemma
A smaller statement inside the note.
:::
::::
```

Bodies and titles support Markdown and math. Links use normal Markdown syntax; statements are not automatically numbered. Generic Markdown viewers may show directive fences literally.

## Illustrations, code and tables

```markdown
:::figure[A caption for the illustration.]{#diagram}
![Meaningful description](./diagram.svg)
:::
```

Use SVG for authored diagrams, or local PNG/JPEG/WebP files. Supply useful alternative text. The title becomes a caption. Astro processes relative image paths for the `/blog/` deployment.

Use fenced code with a language, Markdown tables, and footnotes (`[^name]`). Wide code, tables and display formulas scroll horizontally. `##` and `###` headings populate the table of contents and get direct links.

For other posts, link to public paths such as `/blog/posts/welcome/`, not Markdown source paths. Run `pnpm build && pnpm verify` to catch broken links and anchors.

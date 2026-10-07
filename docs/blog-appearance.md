# Blog appearance

The blog uses a fixed wallpaper, three glass surface densities, and a separate
reading surface. Its presentation is local to `components/blog/`; authored Markdown,
URLs, RSS, and the content schema are unchanged.

## Configure the wallpaper

Edit `components/blog/src/config/appearance.ts`. The `background` export accepts a
source and a CSS `position` (normally `50% 50%`). Configuration changes require a
rebuild. There is no visitor-facing wallpaper selector.

A local image lives under `components/blog/public/`. Its `src` is relative to that
directory and is automatically prefixed with the registered blog mount:

```ts
export const background: BackgroundConfig = {
  source: { kind: 'asset', src: 'backgrounds/aurora.svg' },
  position: '50% 50%',
};
```

For an endpoint returning an image, including an HTTP redirect to an image:

```ts
export const background: BackgroundConfig = {
  source: { kind: 'image', url: 'https://images.example.com/wallpaper' },
  position: '50% 40%',
};
```

For a public JSON endpoint returning `{ data: [{ url: "https://…" }] }`:

```ts
export const background: BackgroundConfig = {
  source: {
    kind: 'json',
    url: 'https://images.example.com/api/wallpaper',
    imagePath: 'data.0.url',
  },
  position: '50% 50%',
};
```

`imagePath` uses dot-separated object keys and array indices. A relative returned
image URL is resolved against the final API response URL. Only HTTP(S) URLs are
accepted. JSON endpoints must allow browser CORS; requests omit credentials.
Do not put private API keys in this public configuration. No proxy or server is
required, and external sources are not contacted during the build.

The bundled wallpaper appears immediately. External images are decoded before a
240ms reveal. The combined request and decoding deadline is eight seconds; invalid
responses, missing fields, failed decoding, and timeouts leave the bundled image
visible. The same background element survives navigation, so an API is contacted
once per document session, not on every route. A full reload starts a new session.
Without JavaScript, local and direct image sources still render; JSON sources use
the fallback. Keep the bundled `backgrounds/aurora.svg` available as the fallback.

## Themes and materials

The theme follows the operating system until the visitor uses the sun/moon button.
The explicit choice is stored in `blog-appearance-theme` in local storage. Removing
that key restores system following. If storage is unavailable, the choice survives
client navigation in memory. The first-paint script and Astro's before-swap hook
apply the theme before a page appears.

Material, color, spacing, and type tokens are in `src/styles/global.css`. `.glass`
contains a decorative `GlassSurface`; `.glass-clear` is used for navigation and the
ToC, and `.glass-reading` for articles. Keep text outside the decorative surface so
navigation can transform the surface without scaling the text. Transparency and
contrast preferences, forced colors, missing backdrop-filter support, and printing
have dedicated fallbacks. Authored figures are never recolored.

## Navigation and motion

Astro's ClientRouter enhances the existing static pages. The background and header
persist; active navigation is updated after each swap. Only a visible selected
post surface is paired with its article header. The source name is applied after
the destination loads but before the outgoing snapshot. Text fades independently,
followed by the body and ToC. A recent history entry can reverse the transition
when both endpoints fit the viewport. Other routes, hash destinations, and clipped
cards use the simpler transition. Astro retains ownership of history and scroll
restoration. RSS and external links use ordinary browser navigation.

Motion timings live in `src/styles/motion.css`. Reduced motion removes movement and
staggering; browsers without View Transitions use a short fallback fade. Same-page
anchors keep their URLs, with an offset measured from the sticky header.

## Verification

Run `pnpm check`, `pnpm build`, `pnpm verify`, and `pnpm test:browser`. Playwright's
browser tests mock image APIs and exercise navigation, themes, failure states,
responsive layouts, and no-JavaScript behavior. Desktop and mobile screenshots are
saved in ignored test output directories for visual review. CI uses Chromium.
For additional engines, set `BLOG_TEST_BROWSER=firefox` or `BLOG_TEST_BROWSER=webkit`
when running `pnpm test:browser` after installing the corresponding Playwright browser.

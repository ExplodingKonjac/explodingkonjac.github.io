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

The navbar's shared pill selects Blog, Tags, or Search. Separate round GitHub,
theme, and language buttons sit beside it. Set `github` in `src/config/site.ts`
to change the new-tab profile link. The RSS feed and its autodiscovery link remain
available, though RSS is no longer a navbar item.

Interface translations live in `src/config/i18n.ts`. Chinese browser locales use
Simplified Chinese; English and unsupported locales use English. An explicit
choice is saved in `blog-ui-language`; removing it restores browser-language
following. Blocked storage retains the choice for the current document session.
Labels, accessibility text, dates, search messages, and fixed page metadata switch
together. Authored titles, summaries, bodies, headings, and tag names are unchanged.
The inline initializer in `src/components/Locale.astro` runs before visible translated
text and on incoming documents. Without JavaScript, the interface remains English.

Search matches words across titles, summaries, and rendered body text, including
Chinese substrings. It ignores case, accent marks, and full-width character
differences, requires every query term to match, and prioritizes titles, then
summaries, then contents. Body matches show an excerpt. Search fetches its static
index once per document session; queries stay in `?q=` for history and bookmarking.
No external search service is used.
Production and preview indexes omit drafts. Without JavaScript, Search shows the
published post list for browsing.

The theme follows the operating system until the visitor uses the sun/moon button.
The explicit choice is stored in `blog-appearance-theme` in local storage. Removing
that key restores system following. If storage is unavailable, the choice survives
client navigation in memory. The first-paint script and Astro's before-swap hook
apply the theme before a page appears.

Shared styles are imported through `src/styles/global.css` in their cascade
order: motion, foundation, UI/layout, content, responsive, then overrides.
Material, color, spacing, and type tokens are in `src/styles/foundation.css`. `.glass`
contains a decorative `GlassSurface`; `.glass-clear` is used for navigation and the
ToC, and `.glass-reading` keeps a denser film for article legibility. The other
surfaces deliberately let substantially more wallpaper show through.

To adjust glass opacity, edit the percentage after `/` in these color tokens in
`components/blog/src/styles/foundation.css`:

| Token             | Surfaces                       | Light | Dark |
| ----------------- | ------------------------------ | ----- | ---- |
| `--glass`         | Headings, summaries, tag tiles | 50%   | 50%  |
| `--clear-glass`   | Navbar and table of contents   | 25%   | 25%  |
| `--reading-glass` | Article body                   | 75%   | 75%  |

Lower percentages make the fill more transparent. Light values live in `:root`;
dark values live in `:root[data-theme='dark']` and are repeated in the
`prefers-color-scheme: dark` block for visitors without JavaScript. Keep those two
dark blocks consistent with the intended fallback: without JavaScript, dark-mode
glass uses 30%, clear glass 20%, and reading glass 62%. Change the color alpha rather than the element's `opacity`,
which would also fade text and alter backdrop compositing. `--shine` controls the
subtle surface highlight and `--scrim` controls the wallpaper overlay independently.
Rebuild to see configuration and stylesheet changes in the production preview.

Tag pills, the theme button, and the active navigation tab use separate
`--control-fill`, `--control-hover`, `--control-border`, `--control-highlight`, and
`--control-shadow` tokens. Their light translucent tint, single illuminated rim,
and faint ambient shadow keep them consistent with the larger glass surfaces.
Pressing a control softens the rim and adds a subtle inset shade without moving
its hit target. Tag links retain 44px hit areas.

The navbar uses one shared glass pill, which slides to the hovered or
keyboard-focused item over 280ms and returns to the active link when interaction
leaves the group. It keeps the same pill across routes and continuously aligns
while docking or resizing. Reduced motion moves it immediately; without
JavaScript, the active link keeps its static glass treatment. The header owns
this behavior in `src/components/SiteHeader.astro`; `aria-current` identifies the
active route.

`src/lib/glass.ts` generates a rounded-rectangle displacement map for each
surface. In Chromium, an SVG backdrop filter bends background pixels within an
18px edge band. Blur rises continuously from a lightly diffused rim to the full
center setting, using a smooth distance mask that follows the rounded outline.
The default ramp reaches full blur 64px inward, capped at half the shorter card
dimension so small controls still have a frosted center. A single
[composited backdrop](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feComposite)
blends the blur levels before refraction; the tint and border stay continuous.
Foreground text is outside the filter. Maps follow resized cards and the navbar's
changing corner radius, and filters are reclaimed after navigation.

These tokens in `src/styles/foundation.css` control the optics independently of opacity:

- `--blur: 8px` controls the maximum center blur (mobile overrides it to `2px`,
  navbar to `8px`). It does not change refraction strength.
- `--blur-edge-ratio: 0.25` sets rim blur as a fraction of the center value. With
  an `8px` center, the rim starts at `2px`. Use `1` to restore uniform blur.
- `--blur-ramp: 64px` sets the distance over which the blur smoothly increases.
  Increase it for a broader transition; it is capped to fit each surface.
- `--refraction-strength: 32` controls how far background pixels bend. Increase it
  for stronger refraction; `0` disables displacement.
- `--refraction-width: 18px` controls how far the curved edge extends into the card.
  Displacement returns smoothly to zero at its inner boundary.

Optical settings are read during initial layout, resizing, and route preparation.
Rebuild/reload after changing stylesheet values. The navbar uses stronger
diffusion so underlying article text doesn't compete with its controls.

Firefox and Safari/WebKit currently use the same translucent tint, fine highlights,
and ordinary backdrop diffusion because SVG backdrop displacement is not rendered
consistently by those engines. Reduced transparency, increased contrast and forced
colors use opaque materials. Authored figures are never recolored.

## Navigation and motion

Astro's ClientRouter owns fetching, history, URLs and scroll restoration. The
wallpaper, navbar, optical filter definitions and temporary flight layer persist.
Native bitmap view transitions are skipped: flattened snapshots and fading an
ancestor of a backdrop filter can change the sampled background and cause a material
pop. Instead, each live glass surface and each text layer animate independently.

After the next document is ready, outgoing glass collapses vertically over 260ms
before HTML is swapped. Content retracts from bottom to top with the closing edge.
Incoming glass grows from zero height over 360ms, streaming its contents into view
from top to bottom, with a small stagger between cards. Text keeps its natural size
and line breaks; it is neither scaled nor rewritten character by character.
Card layout space stays reserved so neighbors and scroll positions remain stable.
For articles taller than the viewport, the visible portion unfolds first and the
offscreen remainder is released at handoff. Neither opacity nor clipping is applied
to a glass ancestor, so the backdrop stays live throughout the motion.
For a visible matching post, a live glass surface travels to the destination's
geometry over 420ms, carrying its title, description, and tag pills. Single-line
titles change typography directly; descriptions and wrapped titles blend between two fixed layouts
along the same path, so line breaks do not jump while the card grows. The date
retracts and reveals at its different positions instead of crossing the title. The
article metadata, body and ToC follow in sequence. This works
for Blog/wordmark links as well as browser history. Missing or clipped endpoints
use the vertical reveal. Rapid navigation cancels and cleans up the previous sequence.
No card ancestor animates opacity, and the material uses its final tint from its
first visible frame. Reduced motion removes animation and delay. Cards are inert
during their reveal, and regain their normal interaction state at completion.

The native post link covers the overview card's empty space as well as its title.
Tag links retain separate hit areas, and modified clicks use normal browser
navigation. Moving content copies are inert and hidden from assistive technology;
keyboard focus moves to the real heading after the animation handoff.

On Tags, a tile and its category header share a stable `data-tag-key`. Once the
surrounding cards have collapsed, the selected glass moves upward and expands over
420ms. Its label moves with it and changes font size, spacing, and line height
directly, keeping the text sharp. The count retracts; the header description and
post list enter as the panel settles. Returning to Tags reverses the transition
and browser history restores focus to the originating tile. Labels that wrap
crossfade at their final typography to avoid line-break jumps. Keyboard focus
waits for the real heading to replace the moving label; reduced motion skips the
flight, and interrupted navigation removes all temporary layers.

`src/components/SiteHeader.astro` maps the first 120px of scroll to a continuous dock progress.
The floating panel widens to the viewport, reaches the top edge and straightens
its corners without replacing the element or changing its blur or tint. Its top,
left, and right rim highlights and refraction fade with the docking progress.
When fully docked, only the bottom edge refracts and starts the blur gradient;
the top and sides remain fully frosted. Scrolling back restores the full floating
outline and its surrounding gradient. Desktop
contents spread toward the outer margins. Compact layouts use two rows, with a
third utility row below 390px so controls remain separate and at least 44px wide. The
flow slot retains its height so reshaping cannot move the document underneath it.
Route-driven scroll restoration eases the persistent bar to its new geometry;
anchor offsets follow its actual dimensions.
At the top, the panel aligns with the current page's centered content shell;
its measurements are refreshed from the new shell after each Astro swap.

Motion behavior lives in `src/lib/navigation.ts`; `src/styles/motion.css`
contains its layer and visibility rules. Animation and reveal helpers live in
`src/lib/navigation-motion.ts`, and shared-card flights in
`src/lib/navigation-flight.ts`. RSS, external links, modified clicks,
and no-JavaScript navigation retain ordinary browser behavior.

## Verification

Run `pnpm check`, `pnpm build`, `pnpm verify`, and `pnpm test:browser`. Playwright's
browser tests mock image APIs and exercise navigation, themes, failure states,
responsive layouts, live exit/entrance material, collision-free navbar docking,
actual edge displacement pixels, and no-JavaScript behavior. Desktop and mobile screenshots are
saved in ignored test output directories for visual review. CI uses Chromium.
For additional engines, set `BLOG_TEST_BROWSER=firefox` or `BLOG_TEST_BROWSER=webkit`
when running `pnpm test:browser` after installing the corresponding Playwright browser.

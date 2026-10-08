# Architecture decisions

## Independent packages, one deployment

`components/` contains deployable projects; `packages/` is reserved for libraries shared by multiple consumers. The workspace includes `components/*`, `components/app/*`, and `packages/*`. Category directories do not have manifests.

Astro owns the blog's static routes and content pipeline. Vite owns the HTML homepage and existing app. New apps default to Vite and TypeScript; add a framework when useful. Plain CSS and custom properties keep presentation easy to change.

Packages are private and uniquely named. Dependencies belong to the packages consuming them. Local dependencies use `workspace:*`; the repository commits one lockfile. Site metadata stays with its owning component; there is no shared site-configuration package.

## URLs and outputs

The blog owns its origin, base path, identity, and URL helpers in `components/blog/src/config/site.ts`. Astro configuration, templates, feeds, and browser code all use that module. It contains no registry of sibling components or homepage profile links.

The homepage owns its metadata and project descriptions in `components/home/site.mjs`. Vite renders these into HTML, so navigation works without client JavaScript. Other apps set their own framework base paths. Homepage project links are curated independently of deployment entries.

The build-only registry in `scripts/components.mjs` lists package names, source directories, mounts, and labels for 404 recovery links. It reads the blog's base path from the blog config; no component imports the registry. The assembler uses the homepage's name for the root 404 and the blog's URL helpers for its sitemap reference. Verification uses the homepage's origin to identify links within the deployed site.

Components build to local `dist/`. The assembler validates every output before clearing `_site/`, then copies the homepage to the root and other components beneath their mounts. It rejects duplicate or overlapping mounts, missing indexes, reserved-path conflicts, generated-file collisions and symlinks. It writes the root 404 page, robots file and `.nojekyll` marker.

The blog's generated pages and sitemap stay within `/blog/`. Its wordmark links to the blog index; the main navigation groups Blog, Tags, and Search. A separate GitHub icon opens the configured profile in a new tab. RSS remains available at `/blog/rss.xml` and through feed autodiscovery. The root robots file points to the blog's sitemap index.

Search builds a local JSON index from published posts' titles, summaries, and rendered body text. The browser ranks matches and filters existing post cards, keeping queries in the URL for history and refresh. The index excludes drafts and uses no external search service. Interface translations live in `src/config/i18n.ts`; an inline TypeScript initializer applies the browser language or saved choice before display and before Astro swaps. Posts and tag names keep their authored text, without duplicate language routes.

Astro uses `site` for the origin, `base` for `/blog/`, static output, directory-format pages and trailing slashes. Astro's ClientRouter enhances blog navigation with live glass-surface transitions while retaining every generated static page. The wallpaper and navigation bar persist between blog routes; RSS uses ordinary document navigation. See [Blog appearance](blog-appearance.md) for theme, wallpaper, and motion configuration.

Blog pages and components own their markup and component-specific browser code.
The header owns theme controls, docking and its selection pill; Background owns
image loading; TableOfContents owns reading-position tracking; Locale owns its
synchronous initializer; and Search owns its form events. Shared browser libraries
handle glass, navigation and search preparation. Navigation prepares incoming
search documents before animations even on the first client visit. Small reused
modules, including GlassSurface, URL helpers and math macros, retain their semantic
boundaries. Global CSS is split into ordered shared sheets without scoped selectors.

Assets stay within each component's subtree. Authored images are colocated and processed by Astro. GitHub Pages has no general SPA rewrite service; future apps use static pages or hash routing.

The preview server uses directory indexes, trailing-slash redirects and actual 404 responses. It never substitutes an app entry for an unknown route.

## Local development

The root `pnpm dev` command builds all components, assembles `_site/`, and starts the static preview server on port 4173. Component `dev` scripts delegate to the root command. There is one HTTP listener and no development-origin rewriting, component-server orchestration, file watching, or hot reload. Framework configurations explicitly set `hmr: false`, `ws: false`, and `watch: null`.

After source edits, manually rebuild and refresh the browser. The snapshot uses the same routes and draft filtering as publication. Browser tests exercise the root development command and verify cross-component navigation stays on one origin without hot-reload clients or WebSocket connections.

## Markdown before MDX

Content collections load `.md` at build time and validate metadata. A shared query supplies posts, tags and RSS and filters drafts using `import.meta.env.DEV`.

Astro 7 uses an explicit `unified()` processor from `@astrojs/markdown-remark` for the directive plugins. Plugins parse directives and math, convert environments to semantic HTML, render KaTeX at build time, and add heading links after assigning heading IDs. KaTeX styles/fonts are bundled locally at a compatible version. Astro provides code highlighting, tables and footnotes.

Numbering, special reference syntax, MDX, diagram generation, search and localization are deferred. Plugins remain blog-local until another component needs them.

## Maintenance boundaries

ORBIT was moved without changing its source. Inline scripts are syntax-checked and browser tests exercise its public UI. Separating its engine, styles and UI is a future change.

Use pnpm scripts until measured build durations justify task caching. Avoid package release tooling for private deployables. Extract shared UI only after multiple components need it.

# Architecture decisions

## Independent packages, one deployment

`components/` contains deployable projects; `packages/` contains shared source or configuration. The workspace includes `components/*`, `components/app/*`, and `packages/*`. Category directories do not have manifests.

Astro owns the blog's static routes and content pipeline. Vite owns the HTML homepage and existing app. New apps default to Vite and TypeScript; add a framework when useful. Plain CSS and custom properties keep presentation easy to change.

Packages are private and uniquely named. Dependencies belong to the packages consuming them. Local dependencies use `workspace:*`; the repository commits one lockfile. Shared `@site/config` exports source ESM without a build step.

## URLs and outputs

The registry in `packages/site-config/index.mjs` defines the origin, identity, directories, descriptions and mounts. The homepage generates project links from it during Vite's HTML transform, so navigation works without client JavaScript. Components derive their framework base from the registry.

Components build to local `dist/`. The assembler validates every output before clearing `_site/`, then copies the homepage to the root and other components beneath their mounts. It rejects duplicate or overlapping mounts, missing indexes, reserved-path conflicts, generated-file collisions and symlinks. It writes the root 404 page, robots file and `.nojekyll` marker.

The blog's navigation and sitemap stay within `/blog/`. Its wordmark links to the blog index, and its footer contains attribution without links to other components or profiles. The root robots file points to the blog's sitemap index.

Astro uses `site` for the origin, `base` for `/blog/`, static output, directory-format pages and trailing slashes. Assets stay within each component's subtree. Authored images are colocated and processed by Astro. GitHub Pages has no general SPA rewrite service; future apps use static pages or hash routing.

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

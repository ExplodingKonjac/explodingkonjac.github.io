# ExplodingKonjac's personal site

A source-only pnpm workspace. Components build independently; GitHub Actions assembles and deploys one complete GitHub Pages artifact.

| Package                 | Source                           | Public route            |
| ----------------------- | -------------------------------- | ----------------------- |
| `@site/home`            | `components/home`                | `/`                     |
| `@site/blog`            | `components/blog`                | `/blog/`                |
| `@site/maimai-renderer` | `components/app/maimai-renderer` | `/app/maimai-renderer/` |

## Getting started

Use Node.js 24 (the exact version is in `.node-version`) and pnpm 12.9.1 (pinned in `package.json`). Install pnpm using the [official instructions](https://pnpm.io/installation), or `npm install --global pnpm@12.9.1`.

```sh
pnpm install --frozen-lockfile
pnpm dev                             # Build everything and serve at http://127.0.0.1:4173
pnpm dev --port 5180                  # Choose a different single port
```

`pnpm dev` builds and assembles a static snapshot, then serves every component through one port. Hot reload, WebSocket transport, and file watching are explicitly disabled in the framework configurations. Component `dev` scripts delegate to this same root command. After editing source, run `pnpm build` in another terminal and refresh the browser, or stop and restart `pnpm dev`. Drafts are excluded from the snapshot just as they are from publication.

```sh
pnpm check                 # Formatting, package checks, unit tests
pnpm build                 # All builds → _site/
pnpm verify                # Output links, anchors, assets and publishing artifacts
pnpm preview               # http://127.0.0.1:4173, ordinary static routing
pnpm exec playwright install chromium
pnpm test:browser          # Single-port navigation, app behavior and no hot reload
```

`pnpm format` formats maintained source. The existing app's HTML is excluded to preserve its byte-for-byte migration.

## Writing and extending

- [Configure blog appearance](docs/blog-appearance.md): wallpaper sources, themes, glass surfaces, and motion.
- [Write a post](docs/authoring.md): metadata, math, directives, illustrations and drafts.
- [Add a component](docs/components.md): package contract, registry and routing.
- [Architecture](docs/architecture.md): stack decisions and source-only policy.
- [Deployment and maintenance](docs/maintenance.md): Pages setup, verification and rollback.

Edit `packages/site-config/index.mjs` to change the origin, identity, or component descriptions. Edit the introduction in `components/home/index.html`.

## Publishing

Select **GitHub Actions** in **Settings → Pages → Build and deployment**. Push to `main` to run the verified build and deploy workflow. Pull requests run checks without publishing. Manual dispatch deploys only when run on `main`; also restrict the `github-pages` environment to `main` as described in the maintenance guide.

Only source, authored assets, configuration, documentation and the shared lockfile belong in Git. `_site/`, `dist/`, generated types, dependencies, and browser reports are disposable outputs.

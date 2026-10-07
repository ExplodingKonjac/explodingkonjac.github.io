# Deployment and maintenance

## First deployment

1. Install from the lockfile; run `pnpm check`, `pnpm build`, and `pnpm verify`.
2. Install Chromium with `pnpm exec playwright install chromium`; run `pnpm test:browser`. CI installs system dependencies automatically.
3. Select **GitHub Actions** in **Settings → Pages → Build and deployment**. Configure `github-pages` to permit production deployments from `main` only. Choose environment approvals to suit your workflow.
4. Commit and push reviewed source to `main`. The workflow checks, builds, verifies links, runs Chromium tests, confirms tracked source remains unchanged, and uploads one complete Pages artifact.
5. Review the deployment URL; check `/`, `/blog/`, `/blog/posts/welcome/`, `/blog/rss.xml`, `/blog/sitemap-index.xml`, and `/app/maimai-renderer/`. Confirm an unknown path returns the 404 page.

PRs run checks without publishing. Manual dispatch runs the same pipeline; deployment is restricted to `main` in the workflow. The deployment job waits for build and holds Pages write/OIDC permissions. Production runs are serialized; a running deployment is not cancelled. Failed browser runs upload a report for seven days.

Initial Pages enablement is a repository setting. No generated-output branch is used. Local verification does not prove public deployment: inspect the successful workflow run and public URLs after infrastructure changes.

## Rollback and monitoring

Revert the bad source change and push the revert to `main`; Actions rebuilds the complete site. Do not edit or commit `_site/`.

Watch Actions checks and environment deployment history. Assembly fails on missing components and path collisions; verification checks links and assets. RSS publishes summaries.

## Project workflow

Use Issues labeled `infra`, `blog`, `app`, or `content`. Keep a small backlog and focused PRs; require the workflow's build job before merging. Initial follow-ups are a personalized introduction, substantive posts, and a separate app-module refactor. Search, localization, numbering and diagram generation remain later features.

Dependabot checks npm and Actions weekly. Compatible npm updates are grouped; major npm upgrades remain separate. Review major framework migration guides and run the full suite. Keep KaTeX compatible with `rehype-katex` and its stylesheet. Update `.node-version` deliberately; update `packageManager` and the lockfile together when upgrading pnpm.

Document changes to boundaries, routing, publishing or authoring in the relevant guide. Measure build durations before adding task caches. Source and lockfile must suffice for a clean build; all local caches and dependencies are disposable.

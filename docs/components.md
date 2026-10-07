# Adding a component

1. Create `components/app/your-app/` or `components/your-component/`. Use the existing app as a Vite configuration reference, with TypeScript source for new apps.
2. Add a manifest with a unique name such as `@site/your-app`, `private: true`, `type: module`, and an `@site/config: workspace:*` dependency. Declare framework/tool dependencies locally.
3. Provide `dev`, `check`, `build`, and `preview`. Set `dev` to `pnpm --workspace-root dev` so it uses the assembled single-port site. For Vite/TypeScript the other commands are `tsc --noEmit`, `vite build`, and `vite preview`. Set `server.hmr: false`, `server.ws: false`, and `server.watch: null` in the framework configuration. Build to `dist/index.html` and self-contained assets in `dist/`.
4. Register `id`, `package`, `directory`, `mount`, `title`, and `description` in `packages/site-config/index.mjs`. Use a mount such as `/app/your-app/`.
5. Read the mount in framework configuration. Use `componentUrl('your-app', ...)` for links, passing logical unencoded segments. Import assets through the framework; dynamically generated asset URLs need its base prefix.
6. Run `pnpm install`, `pnpm check`, `pnpm build`, `pnpm verify`, and `pnpm test:browser`. Review the generated homepage link and component under production preview.

Workspace builds and registry-driven assembly include the component automatically. Add an explicit workspace glob when introducing a deeper category.

Mounts start and end with `/`, contain lowercase letters, digits or hyphens, and are unique. Non-root mounts cannot contain another mount. The homepage cannot write into mounted subtrees. Components must be static; server adapters require a separate hosting decision.

Keep shared libraries under `packages/` and import them through their package name with `workspace:*`. Libraries need neither a deployment entry nor `dist/index.html`.

Develop with `pnpm dev`: every component is built, assembled, and served on one port without watchers or hot reload. Use `componentUrl()` for mount-relative links. Rebuild with `pnpm build` and refresh after edits. `pnpm preview` serves an existing assembly without rebuilding. Avoid history routing unless every URL has a generated static page.

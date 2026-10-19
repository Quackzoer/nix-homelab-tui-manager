# Conventions

Status: implemented

## Tooling

- Package manager is **bun** (workspaces, top-level `catalog` in the root `package.json`). Add dependencies as `catalog:` entries, never pin versions inside an app.
- Toolchain is **Vite+**: `vp check` (format, lint, types), `vp test`, `vp run <script>`. `vp run ready` runs everything the CI runs.
- TypeScript 7 needs explicit `types` (`["bun", "node"]`) in each app tsconfig.
- Shared code goes in `packages/core` and is consumed as TypeScript source. Do not duplicate command strings in the apps.

## Scripts

- Root scripts delegate to apps (`dev:client`, `dev:host`, `hl`). App scripts only do things for that app.
- Script caching is off (`run.cache.scripts = false` in `vite.config.ts`) so `vp run hl ...` always executes.

## Code rules

- Every remote command is built in `packages/core` and covered by a test in `packages/core/tests`.
- Quote everything that is not a literal (`shellQuote`). Validate names (`assertName`).
- Errors shown to the user say what failed and what to do next. Map known exit codes to plain messages (see `explain` in `MenuItem`).
- Long operations show a spinner (`startSpinner`) and print progress to stderr, results to stdout.

## Git and release flow

- Work on `dev` (no workflows run). Merge into `main` to publish a release.
- Markdown-only pushes do not trigger a release (`paths-ignore`). A push that creates a branch at an already-pushed commit does not trigger one either; use "Run workflow" in the Actions tab.
- Bump `MAJOR_MINOR` in `release.yml` by hand for bigger releases.
- Config changes: commit and push `nix-cfg`, then run `bun run hl deploy` (it refuses if the config repo has unpushed commits, unless `-f`).

## Docs

Update the matching file in `docs/` in the same commit as the change. See [README.md](README.md).

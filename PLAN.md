# Production-readiness plan

Goal: make fantasyplstats.com reliable, secure and low-maintenance again, then ready for search traffic. The predictive model is out of scope for now.

Work through the steps in order, one step per branch and pull request. Every push to `master` deploys to production, so nothing goes to `master` without a PR.

## Decisions

- **Keep the stack:** Next.js (upgrade to 16), React 19, TypeScript, Tailwind 4, shadcn/Radix, TanStack Table, Recharts.
- **Change the architecture:** stop calling the FPL API on every visit. Fetch FPL data at build time and publish the whole site as static files (`output: "export"`).
- **Rebuild on a schedule:** GitHub Actions rebuilds and redeploys every 1–2 hours. If FPL is down or its data fails validation, the build fails and the last good version stays live.
- **Hosting:** keep the existing Azure Static Web App, but deploy plain static files instead of using SWA's hybrid Next.js mode, which is still in preview.

## Findings (November 2026)

### User-facing bugs

- `src/hooks/use-fixture-matrix.ts`: `currentGW` defaults to 1 and `fixture-matrix.tsx` never passes the real gameweek, so the matrix always opens on GW1–6.
- `src/lib/utils.ts` (`buildFixtureMatrix`): in a double gameweek the cell keeps only the last fixture's difficulty, and the average in `use-fixture-matrix.ts` counts both games as one.
- `/players` and `/players/[id]` both download the full `bootstrap-static` payload. The player page does it just to find one player.

### Fragility

- Every visit goes browser → `/api/*` → FPL API, with a one-hour cache. When FPL is down or updating, users see an error.
- Nothing validates FPL responses, so a renamed field breaks the UI silently.
- `src/app/api/player-summary/[id]/route.ts` has no caching, no id validation, and reads `params` synchronously.
- The deploy uses SWA's hybrid Next.js mode (preview).

### Security and maintenance

- `next@15.3.4`: `npm audit` reports 5 vulnerabilities (1 critical, 4 high).
- `next.config.ts` sends `Access-Control-Allow-Origin: *` with POST/PUT/DELETE on `/api/*`, which makes the site an open FPL proxy.
- No tests. The deploy workflow doesn't run lint or type checks, and its actions are on old major versions (`checkout@v3`, `cache@v3`).
- The workflow has no job that closes PR preview environments, so they pile up until SWA's preview-environment cap blocks new ones.
- The build downloads Geist from Google Fonts, so it fails anywhere Google Fonts is unreachable.

### Code health

- `usePlayers` has sorting logic nothing uses (TanStack Table does the sorting). `API_ENDPOINTS.teams` and `APP_CONFIG.version` are unused.
- Data fetching is hand-rolled `useEffect` code in hooks.
- The README describes Vercel and React Query, neither of which is used. The `package.json` repository URL points at `ahaidar/` instead of `alihaidar2/`.

## Step 1: Upgrade and secure

- Require Node 20.9+: add `engines` and `.nvmrc`, and run CI on Node 22 LTS.
- Run `npx @next/codemod@canary upgrade latest` to move to Next.js 16 and the matching React version.
- Replace the `next lint` script with `eslint .`, since `next lint` is removed in Next.js 16. Add a `typecheck` script (`tsc --noEmit`).
- Make `params` async in the player-summary route.
- Load fonts from the `geist` npm package instead of Google Fonts.
- Remove the CORS headers from `next.config.ts`.
- Bring `npm audit --omit=dev` to zero high or critical findings.
- Deploy workflow: update action versions, run lint and typecheck before the build, and add the job that closes PR preview environments.
- Fix the README and `package.json` metadata.

Done when lint, typecheck and build pass locally, the site behaves the same in `npm run dev`, and the PR preview deploy works.

## Step 2: Static architecture

### Data layer

- `scripts/fetch-fpl.ts` runs before `next build`. It fetches `bootstrap-static`, `fixtures`, and `element-summary` for each player, with at most about 5 requests at once, timeouts, and retries with backoff. It validates everything with zod and writes a snapshot with a `generatedAt` timestamp to `.data/` (gitignored). Any failure exits non-zero.
- `src/lib/fpl/` holds the zod schemas, types inferred from them, and transforms into slim view models (player row, player detail, fixture matrix). Pages read only these view models.

### Pages

- `next.config.ts`: set `output: "export"` and use unoptimized images (or plain `<img>`).
- `/fixtures`: a server component builds the matrix and passes it to the client matrix component. The default range starts at the next gameweek (`events[].is_next`, falling back to `is_current`, then the last gameweek).
- Double gameweeks: a cell holds all of that week's fixtures with their difficulties, and averages count every fixture.
- `/players`: send only the columns the table uses.
- `/players/[id]`: `generateStaticParams` for every player, and `generateMetadata` with the player's name.
- The footer shows "Data updated …" from `generatedAt`. Also publish `/health.json` with `generatedAt` and the current gameweek.
- Delete `src/app/api/*` and the `useEffect` fetching hooks.

### Tests

- Vitest unit tests for the transforms (matrix building, current gameweek, double and blank gameweeks). Use small recorded FPL responses in `test/fixtures/` so tests never call FPL.

Done when `npm run build` produces `out/` with every page prerendered, pages show data with JavaScript disabled, and tests pass.

## Step 3: Automation

- Deploy workflow triggers: push to `master`, a schedule every 1–2 hours, and manual `workflow_dispatch`. Steps: fetch, build, then deploy `out/` to SWA with `skip_app_build: true`. Use a `concurrency` group so deploys never overlap.
- PR workflow: lint, typecheck, tests, and a build against a small recorded snapshot so PRs don't depend on FPL.
- Keep-alive: GitHub disables scheduled workflows in public repos after 60 days without repository activity. Add a keep-alive step so the schedule survives the off-season.
- Freshness check: a scheduled job reads `https://fantasyplstats.com/health.json` and fails if `generatedAt` is more than 6 hours old, so GitHub emails a failure.
- Dependabot: npm weekly with minor and patch updates grouped, GitHub Actions monthly.
- `staticwebapp.config.json`: 404 page, cache headers for static assets, basic security headers.

Done when a scheduled run deploys on its own, and pointing the fetch at a bad FPL URL makes the run fail while the live site keeps the last good data.

## Step 4: Search readiness

- Per-player titles, descriptions and canonical URLs.
- `app/sitemap.ts` and `app/robots.ts`.
- Open Graph images for player pages. Check that they work with static export.
- Lightweight analytics, so traffic can be measured before any decision about ads.

## Risks to check early

- Whether FPL's API accepts requests from GitHub-hosted runners. Test this first in step 2. If it's blocked, move the fetch into an Azure Function that hands the snapshot to the build.
- Request volume: about 700 `element-summary` calls per build. Keep them throttled. If builds get slow, refresh `element-summary` only for players with new minutes.
- Players FPL adds mid-season appear after the next scheduled rebuild.

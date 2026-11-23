# Production-readiness plan

Goal: make fantasyplstats.com reliable, secure and low-maintenance again, then ready for search traffic. The predictive model is out of scope for now.

Work through the steps in order, one step per branch and pull request. Every push to `master` deploys to production, so nothing goes to `master` without a PR.

## Decisions

- **Keep the stack:** Next.js (upgrade to 16), React 19, TypeScript, Tailwind 4, shadcn/Radix, TanStack Table, Recharts.
- **Change the architecture:** stop calling the FPL API on every visit. Fetch FPL data at build time and publish the whole site as static files (`output: "export"`).
- **Rebuild on a schedule:** GitHub Actions rebuilds and redeploys every 30 minutes on days with Premier League matches, every 2 hours on other days, and once shortly after the nightly price change (01:40 UK time). Match-day runs refetch `element-summary` only for players whose teams have played and reuse the rest from the previous snapshot. If FPL is down or its data fails validation, the build fails and the last good version stays live.
- **Reusable data layer:** `src/lib/fpl/` (client, zod schemas, transforms) has no Next.js or React imports, so a future Azure Function can reuse it for a live match-day mode.
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

**Done** (#4): Next.js 16, Node 22, async params, local Geist fonts, no CORS headers, a clean `npm audit`, updated actions, and the job that closes PR previews.

## Step 2: Static architecture

Static export changes what Azure deploys, so this step also moves the deploy to `out/` and adds the scheduled rebuilds. Without them, merging would either break production or freeze the data.

### Data layer

- `scripts/fetch-fpl.ts` runs before `next build`. It fetches `bootstrap-static`, `fixtures`, and `element-summary` for each player, with at most about 5 requests at once, timeouts, and retries with backoff. It validates everything with zod and writes a snapshot with a `generatedAt` timestamp to `.data/` (gitignored). Any failure exits non-zero.
- `src/lib/fpl/` holds the throttled client, the zod schemas, types inferred from them, and transforms into slim view models (player row, player detail, fixture matrix). Pages read only these view models. It has no Next.js, React or `@/` imports (an ESLint rule enforces this), so a future Azure Function can reuse it for a live match-day mode.
- On match days, the fetch refetches `element-summary` only for players whose teams have kicked off since the previous snapshot (plus new players and players who changed team) and reuses the rest. Otherwise, or without a usable previous snapshot (missing, invalid, over 24 hours old or from another season), it refetches every player.

### Pages

- `next.config.ts`: set `output: "export"` and use unoptimized images (or plain `<img>`).
- `/fixtures`: a server component builds the matrix and passes it to the client matrix component. The default range starts at the next gameweek (`events[].is_next`, falling back to `is_current`, then the last gameweek).
- Double gameweeks: a cell holds all of that week's fixtures with their difficulties, and averages count every fixture.
- `/players`: send only the columns the table uses.
- `/players/[id]`: `generateStaticParams` for every player, and `generateMetadata` with the player's name.
- The footer shows "Data updated …" from `generatedAt`. Also publish `/health.json` with `generatedAt` and the current gameweek.
- Delete `src/app/api/*` and the `useEffect` fetching hooks.

### Deploy and schedule (moved from step 3)

- The workflow fetches, builds `out/` and deploys it to SWA with `skip_app_build: true`.
- Triggers: push to `master`, pull requests, `workflow_dispatch` (with an option to refetch every player), and four UTC crons. `scripts/plan-run.ts` gates each scheduled run using the previous snapshot's fixtures, in UK time:
  - `5,35 * * * *`: every 30 minutes, deploys only on days with Premier League matches.
  - `20 */2 * * *`: every 2 hours, deploys only on days without matches.
  - `40 0 * * *` and `40 1 * * *`: 01:40 UK time after the nightly price change. Only the one matching the current GMT or BST offset deploys.
- The previous snapshot persists between runs in the Actions cache. It is saved only after a successful fetch and build.
- A `concurrency` group queues production deploys so they never overlap.
- The deploy job has `pull-requests: write` so the deploy action can comment the preview URL. The rest of the workflow is read-only.

### Tests

- Vitest unit tests for the transforms (matrix building, current gameweek, double and blank gameweeks), the schedule rules, incremental refresh, and the client's retries and throttling. Use small recorded FPL responses in `test/fixtures/` so tests never call FPL.

### Housekeeping

- Commit `AGENTS.md` (written by Next.js) and import it from `CLAUDE.md` with `@AGENTS.md`.
- Drop Node 20 from `engines`: Azure no longer builds the app, and CI uses Node 22.

Done when `npm run build` produces `out/` with every page prerendered, pages show data with JavaScript disabled, tests pass, and the PR preview serves the static site.

**Done** (#5): the site is a static export built from a validated snapshot, deployed to Azure as plain files on push, on PRs and on the UK-time schedule.

## Step 3: Automation

- Deploying `out/`, the schedule, `workflow_dispatch` and the `concurrency` group moved to step 2.
- PR workflow: lint, typecheck, tests, and a build against a small recorded snapshot so PRs don't depend on FPL.
- Keep-alive: GitHub disables scheduled workflows in public repos after 60 days without repository activity. Add a keep-alive step so the schedule survives the off-season.
- Freshness check: a scheduled job reads `https://fantasyplstats.com/health.json` and fails if `generatedAt` is more than 6 hours old, so GitHub emails a failure.
- Dependabot: npm weekly with minor and patch updates grouped, GitHub Actions monthly.
- `staticwebapp.config.json`: 404 page, cache headers for static assets, basic security headers.

Done when a scheduled run deploys on its own, and pointing the fetch at a bad FPL URL (`FPL_BASE_URL`) makes the run fail while the live site keeps the last good data.

**Done** (#6, #12, #13): CI on PRs from a recorded snapshot, the hourly freshness check (alerting through a "Site data is stale" issue), keep-alive through the GitHub API, Dependabot with auto-merge for minor and patch updates, and `staticwebapp.config.json`. A bad `FPL_BASE_URL` makes the fetch exit 1 and leaves the previous snapshot untouched. Not yet seen: neither scheduled workflow had fired by 22 November 2026, 22:00 UTC, about 1.5 hours after the schedules reached master. Confirm the first scheduled deploy and freshness run in the Actions tab.

## Step 4: Search readiness

- Per-player titles, descriptions and canonical URLs.
- `app/sitemap.ts` and `app/robots.ts`.
- Open Graph images for player pages. Check that they work with static export.
- Lightweight analytics, so traffic can be measured before any decision about ads.

**Done.**
- Every page has its own title, description and canonical URL (with the trailing slash the site serves), from `src/lib/metadata.ts`. Player pages use the player's name, team and position.
- `sitemap.xml` (home, fixtures, players and every player page) and `robots.txt` are prerendered into `out/`.
- Open Graph: one site-wide image, written to `out/opengraph-image/og.png` so Azure serves it as a PNG. Per-player images were measured and dropped: they added about 53 MB to `out/` (94 → 150 MB) for about 2.5 seconds of build time.
- Analytics: Cloudflare Web Analytics (cookieless). The beacon is only in production builds, and only when the `CF_ANALYTICS_TOKEN` Actions secret is set.

## Step 5: Features (more stats, then the AI gameweek recap)

Goal: give people a reason to come back every gameweek. The home page becomes the latest recap, with the free tools around it. The mini-league page and any paid tier come later.

`docs/fpl-api.md` describes every FPL endpoint and field this step relies on. Read it first.

### 5a: More stats (one PR, no AI)

- Widen the zod schemas to keep fields FPL already sends that the site drops. No new endpoints.
  - Players (`bootstrap-static`): `expected_goal_involvements`, the `_per_90` versions of the expected stats, `defensive_contribution` (+ per 90), `clearances_blocks_interceptions`, `tackles`, `recoveries`, `saves_per_90`, `starts`, `chance_of_playing_next_round`, `transfers_in_event`, `transfers_out_event`, `cost_change_event`, `cost_change_start`, and the set-piece order fields.
  - Per-gameweek history (`element-summary`): `goals_scored`, `assists`, `bonus`, `bps`, `defensive_contribution`, `value` (price), `selected` (ownership count), `transfers_balance`.
  - Gameweeks (`events`): `data_checked`, `average_entry_score`, `highest_score`, `most_captained`, `most_transferred_in`, `top_element_info`, `chip_plays`.
- Players table: keep today's columns as the "Overview" view and add switchable views:
  - Attack: xG, xA, xGI (each also per 90), goals minus xG, set-piece badges.
  - Defence: defensive contribution (+ per 90), CBI, tackles, recoveries, xGC per 90, saves per 90.
  - Transfers and price: transfers in and out this gameweek, price change this gameweek and since the start.
  - Minutes and bonus: minutes, starts, bonus, BPS.
  - An availability badge from `chance_of_playing_next_round` on every view.
- Player pages: a price and ownership chart over the season, xG and xA added to the points chart, per-gameweek bonus, BPS and defensive contribution, and set-piece duties.
- Not included: FPL's price-change projection fields (undocumented; watch them first), FPL's own expected points (`ep_next`), and the rank fields.
- Measure `out/` before and after (about 94 MB now; the Free plan allows 250 MB), and keep page data slim.

Done when the new views and charts render from a recorded snapshot and from live data on the PR preview, tests cover the new transforms, and the `out/` size change is in the PR description.

**Done** (#18):
- The schemas keep the listed fields, and the snapshot is now version 2, so a cached version 1 snapshot fails validation and the next fetch refetches every player. The `_per_90` fields arrive as numbers, not strings.
- Transforms in `src/lib/fpl/transforms.ts` add availability (from `status` and `chance_of_playing_next_round`), set-piece duties, goals minus xG, net transfers, price changes in £m, and per-gameweek rows for the player page (a double gameweek's matches added together).
- Players table: Overview, Attack, Defence, Transfers and price, and Minutes and bonus tabs over one TanStack column list. The view is linkable (`/players/#attack`), and the availability badge shows on every view.
- Player pages: set-piece duties, new season stats, and three charts (points with xG and xA, price and ownership, BPS, bonus and defensive contribution). Each chart stacks panels on a shared gameweek axis instead of using two y-axes, and a gameweek-by-gameweek table is built in the browser on demand. The history reaches the browser once, through one client component.
- `out/` grew from 90.8 MB to 105.8 MB (97 → 118 MB on disk) with live data at GW11, mostly in player pages (about 20 KB each). The per-gameweek history grows through the season, adding roughly another 10–15 MB by GW38.
- Follow-up (#19): the table shows FPL's short names with the full name as a tooltip, search matches short, first, second and full names (ignoring case and accents), column widths are fixed, and pages no longer scroll sideways on phones.

### 5b: AI gameweek recap (several PRs, in this order)

An agent investigates each finished gameweek through tools over verified data, writes a short recap, and a deterministic checker verifies every claim before a person approves it.

1. **Tools and checker** (plain code, no AI calls). In `src/lib/recap/`, with no Next.js, React or `@/` imports.
   - Fetch and validate the gameweek: `event/{gw}/live/`, `event-status/`, `dream-team/{gw}/`, `fixtures/?event={gw}`, plus the snapshot. Add zod schemas for the new endpoints.
   - Story-shaped tools that return readable results with season context: `gameweek_summary`, `top_performers`, `player_story`, `find_players`, `ownership_outcomes`, `expected_vs_actual`, `defensive_contributions`, `team_story`, `discipline_and_availability`, `price_changes`, `season_records`, and `submit_recap`. This list is a starting point: the evals decide what to merge, split or drop.
   - Every tool result gets an id and goes into an evidence log.
   - Checker: every number and every player or club name in the recap must appear in tool results the agent received; each claim's numbers must appear in the results it cites; length limits; nothing about betting or odds, no links, no managers' real names. The recap can only cover what the data shows (no team news, quotes or tactics).
   - Tests: tools against recorded data (including double and blank gameweeks), and a set of deliberately broken recaps the checker must reject.

   **Done** (#21): `src/lib/recap/` has the gameweek context (cut off at the gameweek, so replaying a past one sees no later data), the 12 tools with zod inputs exported as JSON Schema, the evidence log, the saved-recap schema with a hand-written sample (`test/fixtures/recap/sample-recap.json`), and the checker. `src/lib/fpl/` fetches and validates the four gameweek endpoints, and the snapshot is version 3 (it now keeps fixture scores, `known_name` and `ranked_count`). The checker also ties each number to its stat ("three assists" needs an assists figure of 3), to the player, club or match it belongs to, and to this gameweek rather than the season unless the sentence says so. Its known gaps are listed at the top of `checker.ts`.
2. **Eval harness.** Record GW1–12 of 2026/27 into `test/fixtures/`. For each gameweek, a reference list of its 3–5 biggest stories (drafted from the data, corrected by hand). A script runs the agent on every recorded gameweek and reports: checker pass rate, story coverage against the references, tool calls, tokens, cost and time.
   - **Done, data half** (#20): `scripts/record-gameweeks.ts` records settled gameweeks into `test/fixtures/gameweeks/` (raw `fixtures/?event=N`, `event/N/live/` and `dream-team/N/`, the `events` array, identity-only teams and players, and trimmed `element-summary` history for everyone who played). GW1–10 are recorded (3.9 MB); GW11–12 hadn't settled on 23 Nov 2026, so re-run the script once they have. Draft reference stories for GW1–10 are in `evals/references/2026-27/` and still need a human review. The scoring script waits for the agent (item 3).
3. **The agent.** Claude API tool use, with limits on tool calls, tokens and time. On a checker failure: one retry with the errors, then a template recap built from the top tool results. Choose between Haiku and Sonnet with the evals. Score writing quality with a different, stronger model (Opus) against a written rubric. Log every run (tool calls, tokens, cost, check results) next to the recap.

   **Done (partial)** (#22): built and tested offline. `src/lib/recap/agent.ts` runs the tool loop behind a small model interface (the Claude API through `@anthropic-ai/sdk`, or a scripted model in tests), with one retry and the template fallback, and saves attempts, tokens, cost and timing with the recap. `npm run recap:eval` runs it over the recorded gameweeks with an Opus judge for story coverage and the quality rubric. No live model call has been made yet: the live evals, and the choice between Haiku and Sonnet, are still to do.

   - **Eval workflow**: `.github/workflows/recap-eval.yml` (Actions → Recap eval → Run workflow) runs `npm run recap:eval` on demand against the real Claude API, signed in with Workload Identity Federation (no API key stored anywhere), and uploads `evals/results/` as an artifact with the summary on the run page. Inputs: writer and judge models, gameweeks, a `ref` to evaluate a tuning branch's code (the run itself must start from master, the only branch the federation rule trusts), and `fake` to test the plumbing without API calls.
4. **Publishing.** A scheduled workflow runs once a gameweek is settled (`finished` and `data_checked` on the event, bonus added and points final in `event-status/`) and no recap exists for it yet. It writes `content/recaps/<season>/gw<N>.json` and opens a PR. A person reads it on the preview and merges it to publish. Recap PRs never auto-merge. No API key: the workflow signs in with Workload Identity Federation like the eval workflow (`id-token: write`, GitHub's OIDC token exchanged for a short-lived Anthropic token by the SDK, IDs from repository variables), so it must run from master. Spend is capped by the organization's prepaid API credits (no auto-reload).
5. **Site.** The home page shows the latest recap with a gameweek stats box, the next deadline, easiest upcoming fixtures, price risers and fallers, most transferred in, and links to Fixtures and Players. Each recap has a permanent page at `/recap/<season>/gw<N>/`, plus an archive. With no recap yet, the home page falls back to the deadline and fixtures view.

   **Done** (#23): `src/lib/recaps.ts` loads and validates `content/recaps/<season>/gw<NN>.json` at build time (`RECAP_CONTENT_DIR` overrides the folder); a misplaced, invalid or unchecked recap fails the build. `/recap/<season>/gw<N>/` pages (stats box from the snapshot's `events`, an AI-and-review note with the model, previous and next links), the `/recap/` archive, metadata and sitemap entries. The home page leads with the latest recap, then the next deadline, easiest fixtures, price risers and fallers and most transferred in, then the tools and a "Mini-league (coming soon)" card; with no recap it opens on the deadline. CI builds once with no recaps and once with the sample from `test/fixtures/recaps/`.

Done when a real gameweek has gone through generate, check, PR and merge end to end, a recap with an invented number is rejected by the checker, and the eval report is in the PR that introduces the agent.

### After step 5

- Mini-league page and league recaps: needs an Azure Function that reuses `src/lib/fpl/` and `src/lib/recap/`, with caching per league per gameweek and a league size cap, and App Insights monitoring.
- Paid tier: only after checking FPL's terms, the trademark and tax.

## Later

Deferred from steps 1–4:

- Make the freshness check off-season-aware, so it doesn't alert hourly through the summer while FPL's API is down.
- Per-player sitemap `lastmod`: change a player's date only when that player's data changes, instead of every entry using the snapshot's `generatedAt`.
- Migrate to TanStack Table v9 (Dependabot's v9 PR broke the build; major updates are ignored for now).
- TypeScript 7: wait until typescript-eslint and Next.js support it (its Dependabot PR failed lint; majors are ignored for now).
- Per-player Open Graph images: dropped for size (about 53 MB more in `out/`). They would also need a route handler, since Next gives a dynamic `opengraph-image` no file extension.

## Risks to check early

- Whether FPL's API accepts requests from GitHub-hosted runners. Test this first in step 2. If it's blocked, move the fetch into an Azure Function that hands the snapshot to the build.
- Request volume: about 700 `element-summary` calls per full build (about 15 seconds at 5 at once). Match-day runs refetch only players whose teams have played.
- Players FPL adds mid-season appear after the next scheduled rebuild.
- Output size: `out/` is about 95 MB, mostly the RSC payload files Next.js writes next to each of the ~670 player pages. The SWA Free plan allows 250 MB per app.
- Off-season: the freshness check will alert hourly during the summer off-season when FPL's API is down. Pause it or make it off-season-aware before then.

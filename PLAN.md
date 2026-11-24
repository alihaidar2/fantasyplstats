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
   - **Tuning round 1** (recap-tuning PR, 23 Nov 2026): four new tools (`story_candidates`, a ranked shortlist by managers affected and surprise, with season highs; `captaincy`; `transfer_story`; plus runs, week-by-week ownership and transfers in `player_story`, chips, transfers and defensive records in `season_records`, and a match count in `gameweek_summary`), checker fixes for false rejections (shared club nicknames, thresholds, chip words, counts a cited list proves), and a writer prompt that starts from the shortlist. Live evals on GW1–10: Sonnet 5.5 writer with an Opus 5.5 judge went from 76% to 85% story coverage (insight 3.1 to 3.7, story selection 3.3 to 3.7, readability 3.0 unchanged); Opus 5.5 writer with a Fable 5.2 judge from 83% to 91% (3.7 / 3.7 / 2.8 to 4.0 / 4.3 / 3.7), with no template fallbacks. GW8–10 were held out until the final runs. Still open: a `match_moments` tool, counts of named players in the checker ("four hauls: A, B, C and D"), readability with Sonnet, the Haiku re-run, and the choice of model.
4. **Publishing.** A scheduled workflow runs once a gameweek is settled (`finished` and `data_checked` on the event, bonus added and points final in `event-status/`) and no recap exists for it yet. It writes `content/recaps/<season>/gw<N>.json` and opens a PR. A person reads it on the preview and merges it to publish. Recap PRs never auto-merge. No API key: the workflow signs in with Workload Identity Federation like the eval workflow (`id-token: write`, GitHub's OIDC token exchanged for a short-lived Anthropic token by the SDK, IDs from repository variables), so it must run from master. Spend is capped by the organization's prepaid API credits (no auto-reload).

   **Done** (recap-publisher PR): `npm run recap:publish` (`scripts/publish-recap.ts`, logic in `scripts/recap-publisher.ts`) picks the latest finished gameweek once it is settled and has no recap (never an older one, so a scheduled run can't backfill the season; `--gameweek N` asks for one), builds its no-hindsight context from live FPL data (a full snapshot plus the gameweek's `event/{gw}/live/`, `fixtures/?event={gw}`, `dream-team/{gw}/` and `event-status/`), runs the agent (writer `--model`, default `claude-opus-5-5`) and writes the file only when the model's recap passed the checker: a template fallback exits non-zero and publishes nothing. `--dry-run` writes nothing, `--select-only` only says which gameweek is due, and `--fake --recorded --dry-run` runs offline. `.github/workflows/recap.yml` (Actions → Recap → Run workflow, from master; also Mondays to Wednesdays every 6 hours) does that, then commits the file as the owner on `recap/<season>-gw<NN>`, opens a "Recap: Gameweek N" PR with the whole recap, model, cost and checker result in its description, and never opens a second one while that branch or PR exists. A PR opened with `GITHUB_TOKEN` triggers no `pull_request` workflows, so the workflow then dispatches `ci.yml` on the recap branch (`gh workflow run ci.yml --ref recap/...`), whose job reports the required "Lint, Test and Build" check on the branch's head commit. It never starts the deploy workflow: for an Azure preview, close and reopen the PR. Needs "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General).
5. **Site.** The home page shows the latest recap with a gameweek stats box, the next deadline, easiest upcoming fixtures, price risers and fallers, most transferred in, and links to Fixtures and Players. Each recap has a permanent page at `/recap/<season>/gw<N>/`, plus an archive. With no recap yet, the home page falls back to the deadline and fixtures view.

   **Done** (#23): `src/lib/recaps.ts` loads and validates `content/recaps/<season>/gw<NN>.json` at build time (`RECAP_CONTENT_DIR` overrides the folder); a misplaced, invalid or unchecked recap fails the build. `/recap/<season>/gw<N>/` pages (stats box from the snapshot's `events`, an AI-and-review note with the model, previous and next links), the `/recap/` archive, metadata and sitemap entries. The home page leads with the latest recap, then the next deadline, easiest fixtures, price risers and fallers and most transferred in, then the tools and a "Mini-league (coming soon)" card; with no recap it opens on the deadline. CI builds once with no recaps and once with the sample from `test/fixtures/recaps/`.

   **Story cards** (recap-story-cards PR, 24 Nov 2026): the GW10 recap read as too verbose, so a recap is now a headline and 4 to 7 typed cards (`src/lib/recap/cards.ts`: numbers, captaincy, players, matches, transfers, notes) with at most a sentence or two of text each, drawn on the recap page and the home page as data graphics (ownership bars, run blocks, scores with club badges; no player photos). Every figure and name is a field, and every card cites its tool results: the checker reads each card as one sentence per figure naming its player, so invented or misattributed numbers are rejected, and a player's ref must be that player. Saved recaps are version 2; version 1 (paragraphs, like the published GW10) still loads and renders until regenerated. `recapToText` renders the cards as text for the judge, the PR body and the page description. Numbers get thousands separators everywhere, and the publisher names the matches or match days an unsettled gameweek is waiting on. Live evals (Opus 5.5 writer, Fable 5.2 judge, GW1–10), against 91% coverage, insight 4.0, selection 4.3, readability 3.7 and 7/10 first-try passes after tuning: run 1 92%, 3.9 / 4.0 / 2.0, 5/10 first try (badges over the word limit); run 2 (longer badges, stricter headline guidance, sentence-style text rendering) 88%, 3.6 / 3.8 / 2.0, 6/10 first try and one template fallback (GW7: the checker misread "4 wins in a row" as a count of wins, fixed afterwards). The judge's readability rubric expects flowing prose, so it marks the terser card text down. After merging, regenerate GW10 (delete `content/recaps/2026-27/gw10.json`, then Actions → Recap → Run workflow with gameweek 10).

   **Card eval** (same PR): the eval judge now reads a card recap card by card (`recapJudgeView` in `text.ts`: type, title, labelled figures, text) and scores readability with a criterion written for cards, with score anchors (`READABILITY_RUBRICS["cards-v1"]` in `judge.ts`: quick to scan, one point per card, the headline lands, labelled numbers, no stat dump or jargon, plain correct text). Paragraph recaps keep `paragraphs-v1`. The report records `readabilityRubric` and the summary prints the judge's readability reasons; readability is not comparable across rubric versions (coverage, insight and story selection are unchanged). The checker also accepts a club's own figure straight after the club in a sentence that goes on to name players, and a match's goals written as "the eight-goal thriller"; both were false rejections in the card eval runs.

Done when a real gameweek has gone through generate, check, PR and merge end to end, a recap with an invented number is rejected by the checker, and the eval report is in the PR that introduces the agent.

### After step 5

- Mini-league page and league recaps: needs an Azure Function that reuses `src/lib/fpl/` and `src/lib/recap/`, with caching per league per gameweek and a league size cap, and App Insights monitoring.
- Paid tier: only after checking FPL's terms, the trademark and tax.

## Step 6: Free toolkit (every FPL dataset gets a home)

Goal: a complete free FPL stats site built only from the FPL data the site already fetches and validates. Rule: if a feature can be calculated from FPL's API data, build it; if it needs another data source or constant model tuning (points predictions, solvers, team news), skip it.

- 6a. Data layer: the snapshot keeps per-match stats, team of the week for settled gameweeks, and live points for the current gameweek (snapshot v4).

  **Done** (#24): snapshot version 4 keeps every fixture's per-player `stats` (the 11 identifiers FPL sends; a new one is kept with a warning), `finished_provisional` and `minutes`; `dreamTeams` for settled gameweeks (fetched once, then reused from the previous snapshot, however old, unless `--full`, a new season, or a player's points for that round no longer match their history); and `live`, the current gameweek's `event/{gw}/live/` (16 stats plus the points breakdown, players with all-zero stats dropped) with `event-status/`, refetched on every build. A cached version 3 snapshot is ignored, so the first v4 run refetches everything. `checkConsistency` warns when a player in match stats, teams of the week or live data is missing from the bootstrap (kept, shown with a placeholder). Typed accessors for the feature steps are in `src/lib/fpl/accessors.ts`. The live snapshot grew from about 3.0 MB to 3.4 MB at GW11 (match stats 245 KB, live 110 KB, teams of the week 5 KB); the new parts reach roughly 1 MB by GW38, when all 380 fixtures have match stats; `out/` is unchanged, since no page reads the new data yet. The CI snapshot now has the recorded match stats, GW1–2 teams of the week and GW3 live data, and the 436 players they name.
- 6b. Players hub: injuries and availability, price changes (this gameweek and season), value rankings (points and xGI per £m), set-piece takers, template team (most-owned XI).

  **Done** (#25): `/players/availability/` (flagged players grouped by status, most-owned first, with FPL's news and `news_added`), `/players/prices/` (this gameweek's and the season's risers and fallers, net transfers), `/players/value/` (points, xGI and form per £m by position, above a minutes threshold of `max(90, 45 × finished gameweeks)`), `/players/set-pieces/` (every club's takers in FPL's order) and `/players/template/` (the most-owned valid 15 by an exact min-cost flow, its XI, and why ownership isn't effective ownership). Logic in `src/lib/stats/players-hub/`.
- 6c. Teams: league table built from results; a page per club (results, form, goals for and against, clean sheets, xGC, fixtures, top players).

  **Done** (#26): `/teams/` (the table from confirmed and provisional results, with the Premier League's tie-breakers, form, clean sheets and xGC from the goalkeepers' totals when they add up) and `/teams/<slug>/` for all 20 clubs (slugs keyed on the club's stable `code`). Logic in `src/lib/stats/teams.ts`.
- 6d. Matches and gameweeks: results per gameweek, a page per match (scorers, assists, bonus, BPS, cards), team of the week, season dashboard (average and highest scores, captaincy, chips, transfers), double and blank gameweek planner.

  **Done** (#28): `/gameweeks/` (season chart and a row per started gameweek), `/gameweeks/<n>/` (numbers, results and the team of the week on a pitch), `/matches/<id>/` for every match that has kicked off (scorers, stat table, BPS and defensive contributions, provisional bonus while FPL hasn't added it) and `/fixtures/schedule/` (doubles, blanks and postponed matches). Three optional `events` fields added to the schema. Logic in `src/lib/stats/matches/`.
- 6e. Interactive tools (in the browser, from static data): squad and transfer planner (budget, 3 per club, fixtures ahead), player comparison.

  **Done** (#29): `/tools/planner/` (build a squad within FPL's rules, XI and captain, transfers with hits, chips and the bank, saved in the URL and localStorage) and `/tools/compare/` (2 to 4 players, best values highlighted), both reading `/tools/data.json` (about 40 KB for 436 players, players as tuples), plus a `/tools/` hub. Logic in `src/lib/stats/tools.ts` and `tools-data.ts`.
- 6f. Live: live gameweek points with provisional bonus from BPS; a "how FPL points work" page built from the points FPL actually awarded.

  **Done** (#27): `/live/` (freshness banner, top scorers, a searchable table of everyone who has played, match cards with FPL's or provisional bonus) and `/points/` (the scoring rules per position worked out from the live breakdowns and settled gameweeks, with what the data can't pin down yet). The bonus rule matches FPL's bonus in all 100 recorded GW1–10 matches. Logic in `src/lib/stats/live.ts` and `live-points.ts`.
- 6g. Integration: navigation for the new pages, sitemap, home page tool cards.

  **Done** (#30, which merges #24–#29): a grouped header (Fixtures, Players, Gameweeks and Tools menus plus Teams and Recap; one Menu panel on phones; current section and page marked), cross-links (club names to club pages, results to match pages, live match cards to match pages, the recap stats box to its gameweek page), the sitemap with every new page (clubs, gameweeks and matches; settled gameweeks dated from the next deadline), twelve tool cards on the home page, `PATHS` in `src/lib/site.ts` for every page, one provisional bonus rule for the live and match pages, and `src/lib/stats/` under the framework-free lint rule. To stay under the 250 MB limit, `npm run build` now deletes each page's `__next._full.txt` (an unused copy of `index.txt`; `scripts/prune-export.ts`, which also reports the size and warns from 200 MB) and player pages send their history as number rows: a synthetic GW38 build (780 players, 380 matches) is 147 MB instead of 207 MB.

Not in step 6: price-change predictions (FPL's projection fields are undocumented), and anything needing a manager's team ID or league (step 8, which needs a backend).

## Later

Deferred from steps 1–4:

- Make the freshness check off-season-aware, so it doesn't alert hourly through the summer while FPL's API is down.
- Per-player sitemap `lastmod`: change a player's date only when that player's data changes, instead of every entry using the snapshot's `generatedAt`.
- Migrate to TanStack Table v9 (Dependabot's v9 PR broke the build; major updates are ignored for now).
- TypeScript 7: wait until typescript-eslint and Next.js support it (its Dependabot PR failed lint; majors are ignored for now).
- Per-player Open Graph images: dropped for size (about 53 MB more in `out/`). They would also need a route handler, since Next gives a dynamic `opengraph-image` no file extension.

Deferred from step 6:

- Season-scope match pages (`/matches/2026-27/<id>/`, like the recaps): FPL fixture ids restart each season, so `/matches/1/` will be a different match next season and old links will point at it.
- The CI fixture snapshot only covers GW1–6 (GW3 current), so CI can't show doubles, blanks, postponements, a live match or a club's upcoming fixtures; those states are covered by unit tests that edit the snapshot. Record a real double gameweek and an in-progress match day when they happen.
- `out/` growth: about 150 MB at GW38 by the synthetic estimate (match pages about 32 MB, player pages about 104 MB, gameweek pages about 7 MB). Next levers if it gets tight: trim the player page's markup (most of each payload is server-rendered cards and class strings) and the shared layout's weight (the theme toggle and badge classes ship on every page).
- `ordinal()` exists three times (`player-format.ts`, `players-table-format.ts`, `src/lib/stats/teams.ts`) and the live and match pages each have their own match-state labels; merge them into one framework-free helper.
- Club names in the fixture matrix and the players table (both client-side TanStack tables) don't link to the club pages yet.
- Verify `event-status`'s `"r"` value ("points confirmed") once FPL sends one.
- The gameweeks dashboard's chip columns only cover the wildcard, free hit, bench boost and triple captain; other chips in `chip_plays` aren't shown.
- The tools' cached data request (`/tools/data.json`) ignores the data version, so a tab left open across a deploy can mix old and new data.
- The CI fixture snapshot is internally inconsistent (GW3 is current, but GW4–6 fixtures are finished); re-record it from the GW1–10 recordings.
- Azure's free plan caps all environments together at 500 MB, so keep at most 2 PR previews open late in the season.
- If FPL adds bonus to the live totals before the fixture's `bonus` stat, provisional bonus could double-count. Guard it by also treating a match's bonus as added when any player's breakdown for it has a `bonus` line (`bonusAdded` only sees the fixture, so the live breakdown has to be passed to it and `matchBonus`, `pendingBonus` and the live page).
- The live players table shows gameweek totals when filtered to one match of a double gameweek (it says so); per-match figures would need each match's breakdown lines in the packed rows, and BPS isn't in them.

## Risks to check early

- Whether FPL's API accepts requests from GitHub-hosted runners. Test this first in step 2. If it's blocked, move the fetch into an Azure Function that hands the snapshot to the build.
- Request volume: about 700 `element-summary` calls per full build (about 15 seconds at 5 at once). Match-day runs refetch only players whose teams have played.
- Players FPL adds mid-season appear after the next scheduled rebuild.
- Output size: `out/` was about 118 MB at GW11 before step 6, mostly the RSC payload files Next.js writes next to each of the ~670 player pages. Step 6 adds a page per match, gameweek and club; with the duplicate payloads pruned, the estimate for GW38 is about 150 MB. The SWA Free plan allows 250 MB per app, and the build warns from 200 MB.
- Off-season: the freshness check will alert hourly during the summer off-season when FPL's API is down. Pause it or make it off-season-aware before then.

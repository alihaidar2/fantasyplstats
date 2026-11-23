@AGENTS.md

# fantasyplstats

Fantasy Premier League stats site at fantasyplstats.com: AI gameweek recaps, fixture difficulty and a double and blank planner, a players table and player pages with a players hub (injuries, price changes, value, set pieces, template team), the league table and club pages, gameweek and match pages with the team of the week, live points, how FPL scoring works, and a squad planner and player comparison that run in the browser. Built with Next.js, TypeScript and Tailwind as a static export, using data from the unofficial FPL API.

## Current work

Steps 1–4 of `PLAN.md` (production readiness) are done. Step 5 (more stats, then the AI gameweek recap) is in progress: the recap's publishing workflow is still to come. Step 6 (the free toolkit) is done once its integration PR is merged. Page paths are in `PATHS` (`src/lib/site.ts`), the header's menus in `src/lib/nav.ts`, and page calculations in `src/lib/stats/`. `docs/fpl-api.md` is the reference for FPL endpoints and fields. Read `PLAN.md` before starting, and do one step per branch and pull request. Deferred work is under "Later" in `PLAN.md`.

## Commands

- `npm run fetch`: fetch FPL data into `.data/snapshot.json` (`-- --full` refetches every player and every team of the week). Run it before `dev` or `build`. It logs the snapshot's size by part.
- `npm run fetch:fixtures`: write `.data/snapshot.json` from `test/fixtures/` with no network (what the CI workflow builds PRs from; Azure PR previews still fetch live data).
- `npm run dev`: local dev server
- `npm run build`: static export to `out/`, then `scripts/prune-export.ts` deletes each page's unused `__next._full.txt` and reports the size of `out/` (it warns from 200 MB; the host's limit is 250 MB). It also reads the published recaps in `content/recaps/<season>/gw<NN>.json`; an invalid recap fails the build, and with none the home page falls back to the deadline and fixtures.
- `RECAP_CONTENT_DIR=test/fixtures/recaps npm run build`: build with the hand-written sample recap instead (what CI's second build does). Never copy it into `content/recaps/`: everything there is published.
- `npm run lint`: lint (`eslint .`)
- `npm run typecheck`: generate Next.js route types, then `tsc --noEmit`
- `npm test`: Vitest unit tests (no network; they use `test/fixtures/`)
- `npm run recap:eval`: run the recap agent over the recorded gameweeks and score it (`-- --fake` uses scripted models and no network; `--model`, `--judge-model`, `--gameweeks 3,5`). A real run calls the Claude API with whatever credentials the Anthropic SDK finds. Reports go to `evals/results/` (gitignored).

Use Node 22 (`.nvmrc`).

Update this list as later steps in `PLAN.md` add scripts.

## Deploy

- Azure Static Web Apps, through `.github/workflows/azure-static-web-apps-*.yml`. The workflow fetches FPL data, builds `out/` and uploads it with `skip_app_build: true`. It also runs on a schedule (see `SCHEDULES` in `src/lib/fpl/schedule.ts`).
- Any push to `master` deploys to production. Never push to `master` directly: work on a branch and open a PR. PRs to `master` get an Azure preview environment.
- The deploy token lives in GitHub secrets. Never commit secrets.

## Rules

- Before calling a change done, run lint, typecheck, tests and build, and fix any failures.
- The FPL API is unofficial: validate its responses, keep requests throttled (about 5 at once at most), and never call it from the browser.
- Keep `src/lib/fpl/`, `src/lib/recap/` and `src/lib/stats/` free of Next.js, React and `@/` imports (ESLint enforces it), so a future Azure Function can reuse them.
- Every page is written to `out/` several times (HTML plus RSC payloads), and there is one per player, match, gameweek and club: keep repeated pages lean (compact client props, styles on the container rather than every cell).
- Don't add Co-Authored-By trailers or any other AI attribution to commits or pull requests.

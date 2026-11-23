@AGENTS.md

# fantasyplstats

Fantasy Premier League stats site at fantasyplstats.com: a fixture difficulty matrix, a players table and player pages. Built with Next.js, TypeScript and Tailwind, using data from the unofficial FPL API.

## Current work

Steps 1–4 of `PLAN.md` (production readiness) are done. Step 5 (features: more stats, then the AI gameweek recap) is in progress. `docs/fpl-api.md` is the reference for FPL endpoints and fields. Read `PLAN.md` before starting, and do one step per branch and pull request. Deferred work is under "Later" in `PLAN.md`.

## Commands

- `npm run fetch`: fetch FPL data into `.data/snapshot.json` (`-- --full` refetches every player). Run it before `dev` or `build`.
- `npm run fetch:fixtures`: write `.data/snapshot.json` from `test/fixtures/` with no network (what the CI workflow builds PRs from; Azure PR previews still fetch live data).
- `npm run dev`: local dev server
- `npm run build`: static export to `out/`
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
- Keep `src/lib/fpl/` and `src/lib/recap/` free of Next.js, React and `@/` imports (ESLint enforces it), so a future Azure Function can reuse them.
- Don't add Co-Authored-By trailers or any other AI attribution to commits or pull requests.

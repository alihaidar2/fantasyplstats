# fantasyplstats

Fantasy Premier League stats site at fantasyplstats.com: a fixture difficulty matrix, a players table and player pages. Built with Next.js, TypeScript and Tailwind, using data from the unofficial FPL API.

## Current work

The site is being made production-ready. The findings, decisions and step order are in `PLAN.md`. Read it before starting, and do one step per branch and pull request.

## Commands

- `npm run dev`: local dev server
- `npm run build`: production build
- `npm run lint`: lint

Update this list as steps in `PLAN.md` add scripts (typecheck, test, fetch).

## Deploy

- Azure Static Web Apps, through `.github/workflows/azure-static-web-apps-*.yml`.
- Any push to `master` deploys to production. Never push to `master` directly: work on a branch and open a PR. PRs to `master` get an Azure preview environment.
- The deploy token lives in GitHub secrets. Never commit secrets.

## Rules

- Before calling a change done, run lint, typecheck and build, and fix any failures.
- The FPL API is unofficial: validate its responses, keep requests throttled (about 5 at once at most), and never call it from the browser.

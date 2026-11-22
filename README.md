# FPL Stats

Fantasy Premier League stats site at [fantasyplstats.com](https://fantasyplstats.com): a fixture difficulty matrix, a players table and player pages.

## Features

- **Fixture difficulty matrix**: every team's opponents over a gameweek range you pick with a slider, coloured by FPL's difficulty rating, with a sortable average difficulty column.
- **Players table**: every player, with sorting, a name filter, a position filter and pagination.
- **Player pages**: season, attacking, defensive and discipline stats, plus a points-per-gameweek chart.
- **Themes**: light, dark or follow the system setting.

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4, shadcn/ui on Radix UI, Lucide icons
- TanStack Table for the tables, Recharts for the charts
- Data from the unofficial FPL API, fetched at build time and validated with zod. The whole site is a static export (`output: "export"`); the browser never calls FPL.

## Getting started

You need Node.js 22, which `.nvmrc` pins, so `nvm use` picks it up. CI uses the same version.

```bash
git clone https://github.com/alihaidar2/fantasyplstats.git
cd fantasyplstats
npm install
npm run fetch   # download FPL data into .data/
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). No environment variables are needed. Without network access to FPL, use `npm run fetch:fixtures` instead of `npm run fetch`.

## Scripts

| Command                  | What it does                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `npm run fetch`          | Fetch and validate FPL data into `.data/snapshot.json`. Add `-- --full` to refetch every player. |
| `npm run fetch:fixtures` | Write `.data/snapshot.json` from the recorded responses in `test/fixtures/`, with no network     |
| `npm run dev`            | Start the dev server (needs a snapshot)                                                          |
| `npm run build`          | Static export of every page to `out/` (needs a snapshot)                                         |
| `npm run lint`           | Run ESLint                                                                                       |
| `npm run typecheck`      | Generate Next.js route types, then run `tsc --noEmit`                                            |
| `npm test`               | Run the Vitest unit tests against recorded FPL responses in `test/fixtures/`                     |

On match days, `npm run fetch` refetches `element-summary` only for players whose teams have played since the previous snapshot and reuses the rest. Set `FPL_BASE_URL` to point it at another API root.

Run lint, typecheck, tests and build before opening a pull request. CI runs all of them.

## Project structure

```
src/
├── app/                 # App Router pages, prerendered at build time
│   ├── fixtures/        # Fixture difficulty matrix
│   ├── health.json/     # /health.json: data timestamp and current gameweek
│   ├── players/         # Players table and player pages
│   ├── opengraph-image.tsx  # Site-wide share image (out/opengraph-image/og.png)
│   ├── sitemap.ts       # /sitemap.xml
│   └── robots.ts        # /robots.txt
├── components/          # common/, features/, layout/ and ui/ (shadcn)
├── constants/           # App constants
├── hooks/               # UI hooks
└── lib/
    ├── data.ts          # Reads the snapshot during the build
    ├── site.ts          # Site URL, name, description and paths
    ├── metadata.ts      # Titles, descriptions, canonicals and Open Graph tags
    ├── sitemap.ts       # Sitemap and robots.txt entries
    └── fpl/             # Framework-free: zod schemas, throttled client, transforms, snapshot building
public/staticwebapp.config.json  # Azure: 404 page, cache and security headers
scripts/
├── fetch-fpl.ts         # npm run fetch
├── fixture-snapshot.ts  # npm run fetch:fixtures
├── plan-run.ts          # Decides whether a scheduled deploy run deploys
└── check-freshness.ts   # The freshness workflow's check and alert issue
test/                    # Vitest tests and recorded FPL responses
```

## Deployment and workflows

The site is hosted on Azure Static Web Apps. Every push to `master` goes live, so work on a branch and open a pull request; `master` requires the CI check to pass. The plan and its history are in [PLAN.md](PLAN.md).

- **Deploy** (`.github/workflows/azure-static-web-apps-green-plant-0bd68360f.yml`):
  - A push to `master` runs lint, typecheck and tests, fetches FPL data, builds `out/` and deploys it to production as plain static files.
  - A pull request to `master` fetches live data and deploys a preview environment, which is deleted when the pull request closes. Dependabot PRs skip the preview.
  - Scheduled runs refresh the data: every 30 minutes on days with Premier League matches (UK time), every 2 hours on other days, and at 01:40 UK time after the nightly price changes. A manual run from the Actions tab only deploys from `master`.
  - If FPL is down or its data fails validation, the run fails before deploying and the live site keeps the last good data.
  - Production builds include the Cloudflare Web Analytics beacon when the `CF_ANALYTICS_TOKEN` secret is set.
- **CI** (`ci.yml`): on every pull request, lint, typecheck, tests and a build from the recorded snapshot (`npm run fetch:fixtures`), so it never calls FPL. This is the required check on `master`.
- **Site freshness** (`freshness.yml`): every hour, checks that `https://fantasyplstats.com/health.json` is under 6 hours old. A failure opens (or comments on) a "Site data is stale" issue, and the next passing run closes it. A daily job re-enables both scheduled workflows through the GitHub API, so GitHub doesn't disable them after 60 days without activity.
- **Dependabot** (`.github/dependabot.yml`, `dependabot-auto-merge.yml`): npm updates weekly (minor and patch grouped) and GitHub Actions monthly. Minor and patch PRs merge themselves once CI passes and go live with the next scheduled deploy; major updates need a person.

## Data source

All data comes from the [Fantasy Premier League](https://fantasy.premierleague.com/) API. It is unofficial and undocumented, so it can change or go down without notice. This is an unofficial fan site, not affiliated with the Premier League or Fantasy Premier League.

## License

MIT. See [LICENSE](LICENSE).

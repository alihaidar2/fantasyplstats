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

Then open [http://localhost:3000](http://localhost:3000). No environment variables are needed.

## Scripts

| Command             | What it does                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run fetch`     | Fetch and validate FPL data into `.data/snapshot.json`. Add `-- --full` to refetch every player. |
| `npm run dev`       | Start the dev server (needs a snapshot)                                                          |
| `npm run build`     | Static export of every page to `out/` (needs a snapshot)                                         |
| `npm run lint`      | Run ESLint                                                                                       |
| `npm run typecheck` | Generate Next.js route types, then run `tsc --noEmit`                                            |
| `npm test`          | Run the Vitest unit tests against recorded FPL responses in `test/fixtures/`                     |

On match days, `npm run fetch` refetches `element-summary` only for players whose teams have played since the previous snapshot and reuses the rest. Set `FPL_BASE_URL` to point it at another API root.

Run lint, typecheck, tests and build before opening a pull request. CI runs all of them.

## Project structure

```
src/
├── app/            # App Router pages, prerendered at build time
│   ├── fixtures/   # Fixture difficulty matrix
│   ├── health.json/ # /health.json: data timestamp and current gameweek
│   └── players/    # Players table and player pages
├── components/     # common/, features/, layout/ and ui/ (shadcn)
├── constants/      # App constants
├── hooks/          # UI hooks
└── lib/
    ├── data.ts     # Reads the snapshot during the build
    └── fpl/        # Framework-free: zod schemas, throttled client, transforms, snapshot building
scripts/
├── fetch-fpl.ts    # npm run fetch
└── plan-run.ts     # Decides whether a scheduled workflow run deploys
test/               # Vitest tests and recorded FPL responses
```

## Deployment

The site is hosted on Azure Static Web Apps and deployed by `.github/workflows/azure-static-web-apps-green-plant-0bd68360f.yml`:

- A push to `master` runs lint, typecheck and tests, fetches FPL data, builds `out/` and deploys it to production as plain static files.
- A pull request to `master` does the same and deploys a preview environment. The preview is deleted when the pull request closes.
- Scheduled runs refresh the data: every 30 minutes on days with Premier League matches (UK time), every 2 hours on other days, and at 01:40 UK time after the nightly price changes. You can also start a run by hand from the Actions tab.
- If FPL is down or its data fails validation, the run fails before deploying and the live site keeps the last good data.

Every push to `master` goes live, so work on a branch and open a pull request. The production-readiness plan is in [PLAN.md](PLAN.md).

## Data source

All data comes from the [Fantasy Premier League](https://fantasy.premierleague.com/) API. It is unofficial and undocumented, so it can change or go down without notice. This site is not affiliated with the Premier League or FPL.

## License

MIT. See [LICENSE](LICENSE).

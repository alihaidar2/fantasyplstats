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
- Data from the unofficial FPL API, fetched on the server by the route handlers in `src/app/api/`. The browser never calls FPL directly.

## Getting started

You need Node.js 20.9 or later. CI uses Node 22 LTS, which `.nvmrc` pins, so `nvm use` picks it up.

```bash
git clone https://github.com/alihaidar2/fantasyplstats.git
cd fantasyplstats
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). No environment variables are needed.

## Scripts

| Command             | What it does                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run dev`       | Start the dev server                                                   |
| `npm run build`     | Production build. It calls the FPL API to prerender the cached routes. |
| `npm start`         | Serve the production build                                             |
| `npm run lint`      | Run ESLint                                                             |
| `npm run typecheck` | Generate Next.js route types, then run `tsc --noEmit`                  |

Run lint, typecheck and build before opening a pull request. CI runs all three.

## Project structure

```
src/
├── app/            # App Router pages and API route handlers
│   ├── api/        # Server-side proxies to the FPL API
│   ├── fixtures/   # Fixture difficulty matrix
│   └── players/    # Players table and player pages
├── components/     # common/, features/, layout/ and ui/ (shadcn)
├── constants/      # App constants
├── hooks/          # Data and UI hooks
├── lib/            # Utilities, including the fixture matrix builder
├── services/       # FPL API client
└── types/          # TypeScript types
```

## Deployment

The site is hosted on Azure Static Web Apps and deployed by `.github/workflows/azure-static-web-apps-green-plant-0bd68360f.yml`:

- A push to `master` runs lint, typecheck and build, then deploys to production.
- A pull request to `master` runs the same checks and deploys a preview environment. The preview is deleted when the pull request closes.

Every push to `master` goes live, so work on a branch and open a pull request. The production-readiness plan is in [PLAN.md](PLAN.md).

## Data source

All data comes from the [Fantasy Premier League](https://fantasy.premierleague.com/) API. It is unofficial and undocumented, so it can change or go down without notice. This site is not affiliated with the Premier League or FPL.

## License

MIT. See [LICENSE](LICENSE).

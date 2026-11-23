# Published gameweek recaps

Everything in this folder is published to fantasyplstats.com.

One file per gameweek: `<season>/gw<NN>.json` (for example `2026-27/gw04.json`), a saved recap that matches `recapSchema` in `src/lib/recap/recap.ts` and whose `checks.passed` is true. The recap workflow writes them and a person reviews each one in a pull request before it is merged.

The build (`src/lib/recaps.ts`) reads and validates every `.json` file here; a misplaced, invalid or failed recap fails the build. Other files, like this README, are ignored. With no recaps the site still builds, and the home page opens on the deadline and fixtures.

Never put test or hand-written sample recaps here. Builds and tests that need one use `RECAP_CONTENT_DIR=test/fixtures/recaps`.

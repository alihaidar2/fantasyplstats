# Recorded gameweeks for the recap tests

Real FPL data for gameweeks 3 and 4 of 2026/27, recorded on 23 November 2026 by `scripts/record-recap-fixtures.ts`, so the recap tools and checker are tested without calling FPL. `test/recap/helpers.ts` loads them.

- `snapshot.json`: a trimmed snapshot (the output of `buildSnapshot`, already validated, so it holds only the fields the schemas keep). 355 of the 674 players: everyone who played in GW3 or GW4, plus anyone owned by at least 5% of managers who didn't. Gameweeks 1–6 and their fixtures, with the flags rewritten so GW4 is current. Player history runs to GW5. It is snapshot version 4: the fixtures' match stats name only the kept players (so they are complete for GW3 and GW4 only), `dreamTeams` holds GW3 and GW4, and `live` is GW4's live data (cut to the same players) with the recorded `event-status.json`. The version 4 parts were added on 23 November 2026 from the files here and in `../gameweeks/`, without calling FPL; `scripts/record-recap-fixtures.ts` writes the same shape.
- `live-<gw>.json`, `fixtures-<gw>.json`, `dream-team-<gw>.json`: the raw responses of `event/{gw}/live/`, `fixtures/?event={gw}` and `dream-team/{gw}/`, with `live` cut down to the same players. Unknown fields are kept on purpose: the schemas must strip them.
- `event-status.json`: `event-status/` as it was on the recording day, when GW11 was current. It describes a later gameweek than the ones recorded, exactly as it would when replaying a past gameweek.
- `sample-recap.json`: a hand-written recap of GW4 as story cards (saved recap version 2, `cardRecapSchema`), with the evidence log of the tool calls it was written from. It passes the checker, uses every card type, and the site builds against it. A test replays its tool calls; if a tool's output changes on purpose, refresh it with `UPDATE_SAMPLE_RECAP=1 npx vitest run test/recap/cards.test.ts` and copy it to `../recaps/2026-27/gw04.json`.
- `sample-recap-v1.json`: the same gameweek as a version 1 recap (headline, paragraphs and claims), as the first published recaps were written. The version 1 checker tests (`test/recap/checker.test.ts`) and the compatibility tests use it; refresh it with `UPDATE_SAMPLE_RECAP=1 npx vitest run test/recap/checker.test.ts`.

The snapshot runs past the recorded gameweeks on purpose. A recap of GW3 must not see GW4's results, GW5's history rows, or today's prices and ownership, and `test/recap/cutoff.test.ts` checks that against this data.

Tests build double and blank gameweeks, transfers, gameweek 1 and missing live entries by editing copies in memory (`makeDouble`, `makeBlank` in `test/recap/helpers.ts`).

To record again (about 700 throttled requests to the live FPL API): `npx tsx scripts/record-recap-fixtures.ts`. The numbers the tests assert on will need updating.

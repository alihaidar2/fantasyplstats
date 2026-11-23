# Recorded FPL responses

Trimmed copies of real FPL API responses (2026/27 season, recorded 21 November 2026), so tests never call FPL.

- `bootstrap-static.json`: all 20 teams and 4 positions, 6 players, and gameweeks 1–6. The gameweek flags are rewritten so GW3 is current and GW4 is next.
- `fixtures.json`: every fixture in gameweeks 1–6, with the per-player `stats` arrays emptied. `test/fixture-client.ts` fills them back in from `gameweeks/`.
- `element-summary-<id>.json`: history for gameweeks 1–3 of players 1 and 430, plus a few upcoming fixtures and one past season.

Unknown fields are kept on purpose: the schemas must strip them. Tests build double and blank gameweeks by editing copies of these files in memory.

## The CI snapshot (`npm run fetch:fixtures`)

`test/fixture-client.ts` serves these files as an FPL client, and adds what snapshot version 4 keeps from the recorded gameweeks in `gameweeks/`:

- per-match `stats` for all 60 fixtures (GW1–6);
- teams of the week for GW1 and GW2 (the settled gameweeks, since GW3 is current);
- GW3's live data, with `recap/event-status.json` moved onto GW3's match days (4–6 September 2026: every day `"p"`, bonus not added);
- every player those name: 436 in all. Players missing from `bootstrap-static.json` get their real row from `recap/snapshot.json` (recorded 23 November) when it has one, or else an identity row from `gameweeks/bootstrap-static.json` with price and season totals taken from their recorded history (82 players);
- history from `gameweeks/element-history.json`, up to GW3, for everyone but players 1 and 430, who keep their own `element-summary` recordings.

The recordings are from different days, so the snapshot isn't one real moment: GW4–6 already have results, and season totals run past GW3. It is consistent enough for every page to render real-looking data with no network.

`gameweeks/` holds a separate, larger recording of whole gameweeks (2026/27 GW1–10) for the recap evals; see its README.

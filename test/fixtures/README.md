# Recorded FPL responses

Trimmed copies of real FPL API responses (2026/27 season, recorded 21 November 2026), so tests never call FPL.

- `bootstrap-static.json`: all 20 teams and 4 positions, 6 players, and gameweeks 1–6. The gameweek flags are rewritten so GW3 is current and GW4 is next.
- `fixtures.json`: every fixture in gameweeks 1–6, with the per-player `stats` arrays emptied.
- `element-summary-<id>.json`: history for gameweeks 1–3 of players 1 and 430, plus a few upcoming fixtures and one past season.

Unknown fields are kept on purpose: the schemas must strip them. Tests build double and blank gameweeks by editing copies of these files in memory.

`gameweeks/` holds a separate, larger recording of whole gameweeks (2026/27 GW1–10) for the recap evals; see its README.

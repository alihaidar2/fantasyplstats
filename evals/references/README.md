# Reference stories

The 3–5 biggest FPL stories of each recorded gameweek, used to score the recap agent's story coverage (PLAN.md step 5b, item 2). One folder per season, one file per gameweek.

They were drafted from the recorded data in `test/fixtures/gameweeks/` only, with no outside knowledge: no team news, injuries, quotes or anything the files don't show. Every file starts as **DRAFT: needs human review**; remove that line once a person has checked and corrected it.

## Source notation

Paths are relative to `test/fixtures/gameweeks/`. For gameweek N:

| Notation | Where |
| --- | --- |
| `events[N]` | The entry with `id: N` in `bootstrap-static.json` → `events` |
| `live #id` | The entry with that `id` in `gwNN/live.json` (`stats` are the gameweek's totals, `explain` the points breakdown) |
| `history #id` | That player's row with `round: N` in `element-history.json` (`selected`, `value`, `transfers_balance`) |
| `fixture F` | The fixture with that `id` in `gwNN/fixtures.json` |
| `dream-team` | `gwNN/dream-team.json` |

- Ownership is `history.selected`, the number of managers who owned the player that gameweek. A percentage divides it by `events[N].ranked_count` and is approximate.
- Prices are `history.value` in tenths of a million (`value: 155` is £15.5m).
- "GW1–10 high" or "most of GW1–10" means compared across all ten recorded gameweeks.
- Player names are FPL's `web_name`, with the player id in brackets.

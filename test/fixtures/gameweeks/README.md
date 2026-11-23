# Recorded gameweeks (2026/27)

Raw FPL responses for settled gameweeks of the 2026/27 season, for the recap eval harness and recap tests (PLAN.md step 5b). Nothing here calls FPL. `evals/references/2026-27/` holds the reference stories drafted from this data.

**Recorded:** 23 November 2026, 02:28 UTC (`manifest.json` has the exact time). This covers GW1–10.

GW11 and GW12 are missing because they hadn't settled yet: GW11 was still in progress, with provisional points and no bonus, and GW12 hadn't started. The script only records a gameweek once `finished` and `data_checked` are both true. Re-run it after GW12 settles (its deadline is 27 Nov 2026) to add them.

## Files

| File | Contents |
| --- | --- |
| `manifest.json` | When and where it was recorded, the gameweeks recorded and skipped (with reasons), and counts |
| `bootstrap-static.json` | `events`: all 38 gameweeks exactly as FPL sent them (averages, highest score, `most_captained`, `most_transferred_in`, `top_element_info`, `chip_plays`, `transfers_made`, `ranked_count`, ...). `teams`, `element_types` and `elements` are trimmed to identity fields (players: `id`, `code`, `first_name`, `second_name`, `web_name`, `team`, `team_code`, `element_type`). |
| `gwNN/fixtures.json` | `fixtures/?event=N` as sent, including the per-fixture `stats` (goals, assists, cards, saves, bonus, BPS, defensive contribution) |
| `gwNN/live.json` | `event/N/live/`: each player's gameweek `stats` and the points breakdown in `explain`. Players with 0 minutes and 0 points are dropped (see Trimming). |
| `gwNN/dream-team.json` | `dream-team/N/` as sent: the top XI and `top_player` |
| `element-history.json` | `element-summary/{id}/` `history` rows for every player with minutes in a recorded gameweek, keyed by player id. Rows are trimmed to the fields Step 5a's `historyEntrySchema` keeps (including `round`, `fixture`, `opponent_team`, `value`, `selected` and `transfers_balance`) and limited to the recorded rounds. |

Each JSON file has one array item or object entry per line, so it can be grepped and diffed.

## Trimming

- **Total size:** about 3.9 MB for GW1–10, so roughly 4.7 MB with GW11–12.
- **`live.json`:** players with 0 minutes and 0 points are dropped. That's about half the players and half the file, and no information is lost: an absent player had 0 minutes and 0 points that gameweek.
- **`bootstrap-static`:** reduced to `events` plus identity fields. Prices, form, news and season totals change daily and would make the recording look inconsistent with the gameweeks it covers.
- **`element-summary`:** only the trimmed `history` rows are kept. `fixtures` (upcoming games) and `history_past` are dropped.
- **History coverage:** players who never played in a recorded gameweek have no history. Their ownership isn't recorded.

## Gotchas

- **Teams:** a player's `team` in `bootstrap-static.json` is the player's club at recording time. For the club in a given gameweek, use the history row's `fixture` and `was_home` (home: `team_h`, away: `team_a`).
- **Ownership:** `selected` in a history row is a count of managers, not a percentage. `events[].ranked_count` is the closest denominator in this data.
- **Most transferred in:** `events[].most_transferred_in` is ranked by transfers in. `transfers_balance` in history is net (in minus out), so the two can name different players.
- **GW1:** `transfers_made` is 0, and every `transfers_balance` is 0.

## Re-recording

```sh
npx tsx scripts/record-gameweeks.ts            # GW1–12, settled gameweeks only
npx tsx scripts/record-gameweeks.ts --to 10    # a narrower range
```

Options:

- `--from`, `--to`: the gameweek range (default 1–12).
- `--out <dir>`: the output folder (default this one).
- `--allow-unsettled`: also record gameweeks whose points are still provisional. Don't commit those.

The script makes about 30 + (players who played) requests, around 490 for GW1–10. They all go through one limiter, so at most 5 are in flight. Everything is validated before anything is written.

Re-recording rewrites every file here. History rows for past rounds and settled gameweeks shouldn't change, but `events` (future gameweeks) and players' current clubs can. Check the diff, and re-check the reference stories if any recorded number moved.

# FPL API reference

What fantasyplstats knows about the Fantasy Premier League API, as of November 2026 (2026/27 season).

The API is unofficial and undocumented. The Premier League publishes no reference or changelog, so fields and behaviour can change without notice. This file combines:

- community documentation, including a guide whose authors called every public endpoint on 2 November 2026 (sportsapis.dev/fpl-api);
- the real responses recorded in `test/fixtures/` on 21–23 November 2026 (including whole gameweeks 1–10 in `test/fixtures/gameweeks/`), which are the ground truth for field names and formats.

Anything marked *unverified* comes from client libraries or older guides and hasn't been checked against a 2026/27 response.

## Basics

| Topic | What to know |
| --- | --- |
| Base URL | `https://fantasy.premierleague.com/api/` |
| Trailing slash | Every path ends in `/`. Without it, most paths return a 301 to the slashed URL. `fetch` follows it automatically; `curl` needs `-L`. |
| Auth | Public endpoints need no key or login. Endpoints about *your own* account (below) need a logged-in session. |
| Browsers | No `Access-Control-Allow-Origin` header, so browsers can't call it. Call it from a server or build step (this repo's rule anyway). |
| Rate limits | None published and no rate-limit headers. About 70 calls a second apart produced no 429s. This repo stays at 5 concurrent requests with retries and backoff (`src/lib/fpl/client.ts`). |
| Caching | `bootstrap-static/` sends `cache-control: max-age=300`, so polling faster than every 5 minutes returns the same data. Other endpoints say `no-store` but were seen served from a cache up to ~10 minutes old. |
| Updating | Between gameweeks and during data checks, FPL can serve an HTML or plain-text "game is updating" page instead of JSON. The client treats a non-JSON response as retryable. |
| Errors | Unknown ids: 404 with JSON `{"detail": "..."}`. Unknown paths: 404 with a small HTML page, so check the status before parsing. Unplayed gameweeks: some endpoints 404 (`dream-team/`, `picks/`), others return 200 with empty data (`event/{gw}/live/` returns `{"elements": []}`). Out-of-range query values usually return 200 with `[]`. Unknown query parameters are ignored. |
| Sizes | `bootstrap-static/` ~1.8 MB, `event/{gw}/live/` ~475 KB, `fixtures/` ~323 KB, `element-summary/{id}/` ~17 KB. |

### Formats and ids

- **Prices** are integers in tenths of a million: `now_cost: 63` is £6.3m. Manager `bank` and `value` use the same unit.
- **Many decimals are strings**: `form`, `selected_by_percent`, `points_per_game`, `ep_this`, `ep_next`, the `expected_*` season totals, `influence`, `creativity`, `threat`, `ict_index`, `value_form`, `value_season`. Convert before sorting or comparing. The `_per_90` fields (`expected_goals_per_90`, `saves_per_90`, `defensive_contribution_per_90`, ...) are plain numbers, not strings.
- **Timestamps** are ISO 8601 in UTC (`"2026-08-21T19:00:00Z"`).
- **Nullable**: `chance_of_playing_*` is `null` when there's no injury news; fixture scores are `null` before kickoff; `event` on a fixture is `null` while it's unscheduled (postponed).
- **Ids**:
  - `element` / `id` (player): unique within a season only.
  - `code` (player): stable across seasons; `history_past` is keyed by `element_code`.
  - `team` (1–20): per season, alphabetical by club. `team_code` is stable across seasons.
  - `event` (1–38): the gameweek. FPL calls gameweeks "events" everywhere.
  - `element_type` (position): 1 GK, 2 DEF, 3 MID, 4 FWD.
- **Player status**: `a` available, `d` doubtful, `i` injured, `s` suspended, `u` unavailable (left the club or loan), `n` not eligible (*unverified*).

## Endpoints

### Game data (public)

| Endpoint | Returns | Used by this site |
| --- | --- | --- |
| `bootstrap-static/` | Everything static: players, clubs, gameweeks, positions, chips, rules | Yes |
| `fixtures/` | All 380 fixtures with scores, difficulty and per-fixture stats. `?event=N` for one gameweek, `?future=1` for unplayed only. | Yes, with the match stats (snapshot v4); `?event=N` by the recap tools |
| `element-summary/{player_id}/` | One player's remaining fixtures, this season's per-gameweek history, and past seasons | Yes |
| `event/{gw}/live/` | Every player's stats and points for one gameweek, with a points breakdown per fixture | Snapshot (current gameweek, every build) and recap tools (`src/lib/recap/`) |
| `event-status/` | Whether the latest points are provisional and whether bonus has been added | Snapshot (every build) and recap tools |
| `dream-team/{gw}/` | The gameweek's top-scoring XI and its best player | Snapshot (each settled gameweek, fetched once) and recap tools |
| `team/set-piece-notes/` | Set-piece notes per club (note: under `team/`, not the root) | No |
| `stats/best-classic-private-leagues/` | The best-performing private leagues (*unverified*) | No |
| `regions/` | Country/region list used for manager profiles (*unverified*) | No |

### Managers and leagues (public, by id)

| Endpoint | Returns |
| --- | --- |
| `entry/{team_id}/` | A manager's team: name, overall points and rank, team value, bank, and every league they're in |
| `entry/{team_id}/history/` | Per-gameweek record this season (`current`), past seasons (`past`), and chips played (`chips`) |
| `entry/{team_id}/event/{gw}/picks/` | The 15 picks for a gameweek, captain, chip and automatic subs |
| `entry/{team_id}/transfers/` | Every transfer the manager has made (*unverified* fields) |
| `leagues-classic/{league_id}/standings/` | A classic league table, 50 rows a page. `?page_standings=N` for more. Also `new_entries` (managers who joined before the league started scoring). |
| `leagues-h2h/{league_id}/standings/` | A head-to-head league table (*unverified*) |
| `leagues-h2h-matches/league/{league_id}/?event=N` | Head-to-head results for a gameweek (*unverified*) |

### Your own account (login needed)

`me/`, `my-team/{team_id}/` (current squad with selling prices) and `entry/{team_id}/transfers-latest/`. The site has no reason to use these, and they'd mean handling FPL logins.

## bootstrap-static

Top-level keys:

| Key | Contents |
| --- | --- |
| `events` | 38 gameweeks |
| `teams` | 20 clubs |
| `elements` | ~670 players, 109 fields each |
| `element_types` | 4 positions with squad rules (`squad_select`, `squad_min_play`, `squad_max_play`, ...) |
| `element_stats` | Labels for the stat identifiers used in `fixtures` and `event/{gw}/live/` |
| `chips` | Chips with the gameweeks they can be played in (2026/27: two each of `wildcard`, `freehit`, `bboost`, `3xc`) |
| `phases` | The overall season plus monthly phases, with start and end gameweeks |
| `game_settings`, `game_config` | Squad rules, budget (`squad_total_spend: 1000` = £100.0m) and scoring |
| `total_players` | Number of FPL managers (11.2 million on 2 Nov 2026) |

The recorded fixture in `test/fixtures/` keeps only `events`, `teams`, `element_types`, `elements` and a stub `game_settings`.

### events (gameweeks)

`id`, `name`, `deadline_time` (+ `deadline_time_epoch`, `deadline_time_game_offset`), `release_time`, `is_previous` / `is_current` / `is_next`, `finished`, `data_checked`, `released`, `can_enter`, `can_manage`, `average_entry_score`, `highest_score`, `highest_scoring_entry`, `top_element`, `top_element_info` (`{id, points}`), `most_selected`, `most_captained`, `most_vice_captained`, `most_transferred_in`, `transfers_made`, `ranked_count`, `chip_plays` (`[{chip_name, num_played}]`), `cup_leagues_created`, `h2h_ko_matches_created`, `overrides`.

A gameweek is fully settled when `finished` and `data_checked` are both true.

Two things to know when looking back at a past gameweek:

- `most_transferred_in` is filled in for gameweek 1 even though nobody can make a transfer before it. Treat transfer facts as missing for gameweek 1.
- `ranked_count` (managers ranked that gameweek) is the base for past ownership: a history row's `selected` divided by that gameweek's `ranked_count` is within about 0.5% of the `selected_by_percent` FPL showed at the time. `selected_by_percent` itself is only ever today's figure.

### teams

`id`, `code`, `name`, `short_name`, `strength`, `strength_overall_home/away`, `strength_attack_home/away`, `strength_defence_home/away`, `form`, `position`, `played`, `win`, `draw`, `loss`, `points`, `pulse_id`, `team_division`, `unavailable`, `link_url`.

`played`, `win`, `draw`, `loss` and `points` read 0 for every club. Build a league table from `fixtures/` instead.

### elements (players): all 109 fields, grouped

| Group | Fields |
| --- | --- |
| Identity | `id`, `code`, `opta_code`, `first_name`, `second_name`, `web_name`, `known_name`, `team`, `team_code`, `element_type`, `squad_number`, `birth_date`, `team_join_date`, `region`, `photo`, `has_temporary_code`, `special`, `removed`, `can_select`, `can_transact` |
| Availability | `status`, `news`, `news_added`, `chance_of_playing_this_round`, `chance_of_playing_next_round`, `scout_news_link`, `scout_risks` |
| Price and ownership | `now_cost`, `now_cost_rank`, `now_cost_rank_type`, `cost_change_event`, `cost_change_event_fall`, `cost_change_start`, `cost_change_start_fall`, `selected_by_percent`, `selected_rank`, `selected_rank_type`, `transfers_in`, `transfers_out`, `transfers_in_event`, `transfers_out_event` |
| Price-change projections | `price_change_percent`, `price_change_hourly_rate`, `price_change_projections` (`[{offset, projected_percent, likelihood}]`), `price_change_locked_until`, `price_change_calibrating`. Present in the 2026/27 data; their exact meaning isn't documented anywhere we found. Don't build on them without checking how they behave over a few days. |
| Points and form | `total_points`, `event_points`, `points_per_game`, `points_per_game_rank`, `points_per_game_rank_type`, `form`, `form_rank`, `form_rank_type`, `ep_this`, `ep_next` (FPL's own expected points), `value_form`, `value_season`, `bonus`, `bps`, `dreamteam_count`, `in_dreamteam` |
| Season totals | `minutes`, `starts`, `starts_per_90`, `goals_scored`, `assists`, `clean_sheets`, `clean_sheets_per_90`, `goals_conceded`, `goals_conceded_per_90`, `own_goals`, `penalties_saved`, `penalties_missed`, `yellow_cards`, `red_cards`, `saves`, `saves_per_90` |
| Expected stats | `expected_goals`, `expected_assists`, `expected_goal_involvements`, `expected_goals_conceded`, each with a `_per_90` version |
| Defensive | `defensive_contribution`, `defensive_contribution_per_90`, `clearances_blocks_interceptions`, `tackles`, `recoveries` |
| ICT index | `influence`, `creativity`, `threat`, `ict_index`, each with `_rank` and `_rank_type` |
| Set pieces | `penalties_order`, `penalties_text`, `direct_freekicks_order`, `direct_freekicks_text`, `corners_and_indirect_freekicks_order`, `corners_and_indirect_freekicks_text` |

## fixtures/

Each fixture: `id`, `code`, `event`, `kickoff_time`, `provisional_start_time`, `started`, `finished_provisional`, `finished`, `minutes`, `team_h`, `team_a`, `team_h_score`, `team_a_score`, `team_h_difficulty`, `team_a_difficulty` (FDR, 1–5), `pulse_id`, `stats`.

`stats` is a list of `{identifier, h: [{value, element}], a: [{value, element}]}`, split by home (`h`) and away (`a`). Verified against every fixture of GW1–10 of 2026/27 (`test/fixtures/gameweeks/`), and against all 380 fixtures of the unfiltered `fixtures/` by the snapshot's validation:

- Every fixture lists the same 11 identifiers, in this order: `goals_scored`, `assists`, `own_goals`, `penalties_saved`, `penalties_missed`, `yellow_cards`, `red_cards`, `saves`, `bonus`, `bps`, `defensive_contribution`. Unplayed fixtures have `stats: []`. The snapshot keeps any other identifier FPL adds and logs a warning, rather than failing.
- Only non-zero values are listed: a player who played with 0 BPS isn't in the `bps` list (64 such appearances in GW1–10), and nobody is listed for a stat no one got (`h: [], a: []`).
- `bps` and `defensive_contribution` list most of the players who played; `bonus` lists the players who got bonus once it's been added: three per fixture, or four when BPS ties (11 of the 100 recorded fixtures).
- An own goal is listed under the side of the player who scored it, and counts for the other side: home score = home `goals_scored` + away `own_goals`.
- Values are in a random order within each list. Sort before ranking (`matchStat` and `matchStatRows` in `src/lib/fpl/accessors.ts` do).

`test/fixtures/fixtures.json` empties these lists to save space; `test/fixtures/gameweeks/gwNN/fixtures.json` keeps them.

`finished_provisional` turns true at the final whistle; `finished` turns true once FPL confirms the result and bonus. `minutes` is the match minutes played so far (90 at full time in every recorded fixture).

## element-summary/{player_id}/

| Key | Contents |
| --- | --- |
| `fixtures` | Remaining fixtures: `id`, `code`, `event`, `event_name`, `kickoff_time`, `provisional_start_time`, `is_home`, `difficulty`, `team_h`, `team_a`, scores, `finished`, `minutes` |
| `history` | One row per fixture played this season: `element`, `fixture`, `round`, `opponent_team`, `was_home`, `kickoff_time`, scores, `total_points`, `minutes`, `starts`, goals, assists, `clean_sheets`, `goals_conceded`, `own_goals`, penalties, cards, `saves`, `bonus`, `bps`, ICT fields, `expected_*` (no `_per_90`), defensive fields, `value` (price that gameweek), `selected`, `transfers_in`, `transfers_out`, `transfers_balance`, `modified` |
| `history_past` | One row per past season: `season_name`, `element_code`, `start_cost`, `end_cost`, `total_points` and season stat totals |

A double gameweek gives a player two `history` rows with the same `round`.

`bootstrap-static/` gives a player's club today. For a past gameweek, take the club from the history row: its `fixture` and `was_home` give `team_h` or `team_a` of that fixture. They differ after a mid-season transfer.

## event/{gw}/live/

`{ "elements": [ { "id", "stats", "explain" } ] }` with one entry per player:

- `stats`: that gameweek's totals: `minutes`, `goals_scored`, `assists`, `clean_sheets`, `goals_conceded`, `own_goals`, `penalties_saved`, `penalties_missed`, `yellow_cards`, `red_cards`, `saves`, `bonus`, `bps`, `influence`, `creativity`, `threat`, `ict_index`, `total_points`, `in_dreamteam`, `starts`, the four `expected_*` stats (strings) and the defensive stats (`clearances_blocks_interceptions`, `recoveries`, `tackles`, `defensive_contribution`). Verified against GW3 and GW4 of 2026/27.
- `stats` also has `played` (a boolean, true exactly when `minutes` > 0 in every recorded gameweek). The site doesn't keep it.
- `explain`: the points breakdown per fixture: `[{ fixture, stats: [{ identifier, points, value, points_modification }] }]`, e.g. `{identifier: "goals_scored", value: 1, points: 4, points_modification: 0}`. One entry per fixture the player's team had, so two in a double gameweek. A player who didn't play still has an entry (`minutes`, value 0). `points_modification` was 0 in every recorded line of GW1–10; its meaning is undocumented, so the site drops it. The identifiers seen are `minutes`, `goals_scored`, `assists`, `clean_sheets`, `goals_conceded`, `saves`, `bonus`, `yellow_cards`, `red_cards`, `own_goals`, `penalties_missed`, `penalties_saved` and `defensive_contribution`.
- Each element also has `modified` (false in every recording; undocumented, not kept).

It lists only the players who existed that gameweek (654 for GW3 against 674 in `bootstrap-static/` in November), and nothing about price or ownership: those come from `element-summary/` history rows (`value`, `selected`).

One call covers every player for the gameweek, so it's the right source for anything gameweek-wide (the recap) instead of ~700 `element-summary` calls.

Size: the live data for GW11 (in progress, 23 November) had 281 players with a non-zero stat. Trimmed to the stats the snapshot keeps, it was 110 KB, of which 34 KB is `explain`.

## event-status/

Whether the current gameweek's points are final, per day: `status: [{ date, event, points, bonus_added }]` plus `leagues` (league table update state). `date` is `YYYY-MM-DD`, one row per match day of the gameweek. `points` is `""` before a day's matches and `"p"` while provisional (*`"r"` once confirmed, unverified*). `leagues` is a string (`""` in the recording). It only describes the current gameweek, so it says nothing when replaying a past one. Use it to decide when a gameweek's numbers are safe to write about.

## dream-team/{gw}/

`{ top_player: {id, points}, team: [{ element, points, position }] }`: the gameweek's highest-scoring XI. `position` is the slot 1–11, goalkeeper first, then defenders, midfielders and forwards (the formation varies: 1-3-5-2, 1-5-3-2, 1-4-4-2 in GW3–5). `top_player` is the gameweek's best player and is in the XI. 404 until the gameweek has been played. The snapshot fetches it once a gameweek is settled (`finished` and `data_checked`) and reuses it from then on, since a settled gameweek's team never changes.

## Managers and leagues

### entry/{team_id}/

`id`, `name` (team name), `player_first_name`, `player_last_name`, `player_region_name`, region ISO codes, `started_event`, `favourite_team`, `joined_time`, `summary_overall_points`, `summary_overall_rank`, `summary_event_points`, `summary_event_rank`, `current_event`, `last_deadline_bank`, `last_deadline_value`, `last_deadline_total_transfers`, `name_change_blocked`, `kit`, and `leagues` (`classic`, `h2h`, `cup`), each league with its `id`, `name`, `entry_rank` and `entry_last_rank`.

### entry/{team_id}/history/

- `current`: per gameweek: `event`, `points`, `total_points`, `rank`, `rank_sort`, `overall_rank`, `bank`, `value`, `event_transfers`, `event_transfers_cost`, `points_on_bench`.
- `past`: per season: `season_name`, `total_points`, `rank`.
- `chips`: chips played: `name`, `time`, `event`.

### entry/{team_id}/event/{gw}/picks/

- `active_chip`: `null` or the chip played.
- `automatic_subs`: `[{ entry, element_in, element_out, event }]`.
- `entry_history`: that gameweek's summary (the same fields as a `history/` `current` row).
- `picks`: 15 rows of `{ element, position (1–15; 12–15 is the bench), multiplier (0 bench, 1 playing, 2 captain, 3 triple captain), is_captain, is_vice_captain }`.

Picks for a gameweek aren't public until its deadline has passed.

### leagues-classic/{league_id}/standings/

- `league`: `id`, `name`, `created`, `closed`, `max_entries`, `league_type`, `scoring`, `admin_entry`, `start_event`, `code_privacy`, `has_cup`, `cup_league`, `rank`.
- `standings`: `{ has_next, page, results: [{ id, entry, entry_name, player_name, rank, last_rank, rank_sort, total, event_total }] }`, 50 per page.
- `new_entries`: same paging, for managers who joined before the league's first scoring gameweek.
- `last_updated_data`: when FPL last updated the table.

## Personal data

`entry/` and league standings include managers' real names and regions. Store only what a feature needs (ids, team names, points), and don't publish anyone's real name in generated content.

## What each Step 5 feature needs

| Feature | Endpoints | New requests per build |
| --- | --- | --- |
| 5a: more stats | `bootstrap-static/`, `element-summary/` (already fetched; just keep more fields) | None |
| 5b: site-wide gameweek recap | `event/{gw}/live/` (every player's gameweek), `event-status/` (are points final?), `dream-team/{gw}/`, plus `events[]` in `bootstrap-static/` (`most_captained`, `chip_plays`, `top_element_info`, `transfers_made`) | 2–3, once per gameweek |
| 6a: toolkit data layer | `fixtures/` match stats (already fetched), `dream-team/{gw}/` once per settled gameweek, `event/{current}/live/` and `event-status/` | 2 per build, plus one per newly settled gameweek |
| 5c: mini-league page | `leagues-classic/{id}/standings/`, then `entry/{id}/event/{gw}/picks/` for each manager (and `entry/{id}/history/` for chips and transfer costs) | 1 + one or two per manager, per league per gameweek, so it needs caching and a size cap |

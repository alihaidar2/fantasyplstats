// Zod schemas for the parts of the unofficial FPL API this site relies on.
// Unknown keys are stripped, so a parsed snapshot holds only what we use.
// Keep this folder free of Next.js and React imports: it is shared with
// build scripts and, later, an Azure Function.

import { z } from "zod";

/** FPL sends many decimals as strings ("6.0", "47.8"). */
export const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a decimal string");

/** Set-piece order (1 = first choice), or null when the player has no duty. */
const setPieceOrder = z.number().int().positive().nullable();

export const eventSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  deadline_time: z.string().nullable(),
  finished: z.boolean(),
  is_previous: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean(),
  data_checked: z.boolean(),
  // Zero or null until the gameweek has been played.
  average_entry_score: z.number().int(),
  highest_score: z.number().int().nullable(),
  most_captained: z.number().int().nullable(),
  most_transferred_in: z.number().int().nullable(),
  top_element_info: z
    .object({ id: z.number().int().positive(), points: z.number().int() })
    .nullable(),
  chip_plays: z.array(z.object({ chip_name: z.string(), num_played: z.number().int() })),
  /** Managers ranked that gameweek (0 until it starts): the base for a past gameweek's ownership percentages. */
  ranked_count: z.number().int(),
});

export const teamSchema = z.object({
  id: z.number().int().positive(),
  code: z.number().int(),
  name: z.string().min(1),
  short_name: z.string().min(1),
});

export const elementTypeSchema = z.object({
  id: z.number().int().positive(),
  singular_name: z.string().min(1),
  singular_name_short: z.string().min(1),
  plural_name: z.string().min(1),
});

export const elementSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  second_name: z.string(),
  web_name: z.string(),
  /** The name the player is usually known by ("Bruno Guimarães"); empty for most players. */
  known_name: z.string(),
  team: z.number().int().positive(),
  team_code: z.number().int(),
  element_type: z.number().int().positive(),
  status: z.string(),
  news: z.string(),
  /** Percent; null when FPL has no injury or availability news. */
  chance_of_playing_next_round: z.number().int().min(0).max(100).nullable(),
  now_cost: z.number().int(),
  /** Price changes in tenths of a million, this gameweek and since the season started. */
  cost_change_event: z.number().int(),
  cost_change_start: z.number().int(),
  transfers_in_event: z.number().int(),
  transfers_out_event: z.number().int(),
  total_points: z.number().int(),
  points_per_game: decimalString,
  form: decimalString,
  selected_by_percent: decimalString,
  minutes: z.number().int(),
  starts: z.number().int(),
  goals_scored: z.number().int(),
  assists: z.number().int(),
  clean_sheets: z.number().int(),
  goals_conceded: z.number().int(),
  own_goals: z.number().int(),
  penalties_missed: z.number().int(),
  yellow_cards: z.number().int(),
  red_cards: z.number().int(),
  saves: z.number().int(),
  // The _per_90 fields arrive as numbers, unlike the season totals (strings).
  saves_per_90: z.number(),
  bonus: z.number().int(),
  bps: z.number().int(),
  defensive_contribution: z.number().int(),
  defensive_contribution_per_90: z.number(),
  clearances_blocks_interceptions: z.number().int(),
  tackles: z.number().int(),
  recoveries: z.number().int(),
  influence: decimalString,
  creativity: decimalString,
  threat: decimalString,
  ict_index: decimalString,
  expected_goals: decimalString,
  expected_assists: decimalString,
  expected_goal_involvements: decimalString,
  expected_goals_conceded: decimalString,
  expected_goals_per_90: z.number(),
  expected_assists_per_90: z.number(),
  expected_goal_involvements_per_90: z.number(),
  expected_goals_conceded_per_90: z.number(),
  penalties_order: setPieceOrder,
  direct_freekicks_order: setPieceOrder,
  corners_and_indirect_freekicks_order: setPieceOrder,
});

export const bootstrapSchema = z.object({
  events: z.array(eventSchema).min(1),
  teams: z.array(teamSchema).min(2),
  element_types: z.array(elementTypeSchema).min(1),
  elements: z.array(elementSchema).min(1),
});

/**
 * The per-player stat identifiers FPL sent in every recorded fixture's
 * `stats` (2026/27). Others are kept, not rejected, so a stat FPL adds later
 * doesn't break the build; `buildSnapshot` logs a warning for them.
 */
export const MATCH_STAT_IDENTIFIERS = [
  "goals_scored",
  "assists",
  "own_goals",
  "penalties_saved",
  "penalties_missed",
  "yellow_cards",
  "red_cards",
  "saves",
  "bonus",
  "bps",
  "defensive_contribution",
] as const;
export type MatchStatIdentifier = (typeof MATCH_STAT_IDENTIFIERS)[number];

/** One player's value for one stat in one fixture. */
export const fixtureStatValueSchema = z.object({
  value: z.number().int(),
  element: z.number().int().positive(),
});

/**
 * One stat of a fixture, split by side: `{identifier: "goals_scored", h: [...], a: [...]}`.
 * Every identifier is listed even when nobody has it (empty `h` and `a`).
 */
export const fixtureStatSchema = z.object({
  identifier: z.string().min(1),
  h: z.array(fixtureStatValueSchema),
  a: z.array(fixtureStatValueSchema),
});

export const fixtureSchema = z.object({
  id: z.number().int().positive(),
  // Postponed fixtures have no gameweek or kickoff until they are rescheduled.
  event: z.number().int().positive().nullable(),
  kickoff_time: z.string().nullable(),
  started: z.boolean().nullable(),
  /** True at the final whistle; `finished` follows once FPL confirms the result and bonus. */
  finished_provisional: z.boolean(),
  finished: z.boolean(),
  /** Minutes played so far (0 before kickoff, 90 at full time). */
  minutes: z.number().int(),
  team_h: z.number().int().positive(),
  team_a: z.number().int().positive(),
  // Null until kickoff.
  team_h_score: z.number().int().nullable(),
  team_a_score: z.number().int().nullable(),
  team_h_difficulty: z.number().int(),
  team_a_difficulty: z.number().int(),
  /** Per-player stats (goals, assists, cards, saves, bonus, BPS, ...); empty lists before kickoff. */
  stats: z.array(fixtureStatSchema),
});

export const fixturesSchema = z.array(fixtureSchema);

export const historyEntrySchema = z.object({
  fixture: z.number().int(),
  round: z.number().int().positive(),
  opponent_team: z.number().int(),
  was_home: z.boolean(),
  kickoff_time: z.string().nullable(),
  minutes: z.number().int(),
  total_points: z.number().int(),
  goals_scored: z.number().int(),
  assists: z.number().int(),
  bonus: z.number().int(),
  bps: z.number().int(),
  defensive_contribution: z.number().int(),
  expected_goals: decimalString,
  expected_assists: decimalString,
  /** Price that gameweek, in tenths of a million. */
  value: z.number().int(),
  /** How many FPL managers owned the player that gameweek (a count, not a percent). */
  selected: z.number().int(),
  transfers_balance: z.number().int(),
});

export const elementSummarySchema = z.object({
  history: z.array(historyEntrySchema),
});

export type FplEvent = z.infer<typeof eventSchema>;
export type Team = z.infer<typeof teamSchema>;
export type ElementType = z.infer<typeof elementTypeSchema>;
export type Element = z.infer<typeof elementSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type ElementSummary = z.infer<typeof elementSummarySchema>;
export type FixtureStat = z.infer<typeof fixtureStatSchema>;
export type FixtureStatValue = z.infer<typeof fixtureStatValueSchema>;

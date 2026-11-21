// Zod schemas for the parts of the unofficial FPL API this site relies on.
// Unknown keys are stripped, so a parsed snapshot holds only what we use.
// Keep this folder free of Next.js and React imports: it is shared with
// build scripts and, later, an Azure Function.

import { z } from "zod";

/** FPL sends many decimals as strings ("6.0", "47.8"). */
const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a decimal string");

export const eventSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  deadline_time: z.string().nullable(),
  finished: z.boolean(),
  is_previous: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean(),
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
  team: z.number().int().positive(),
  team_code: z.number().int(),
  element_type: z.number().int().positive(),
  status: z.string(),
  news: z.string(),
  now_cost: z.number().int(),
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
  bonus: z.number().int(),
  bps: z.number().int(),
  influence: decimalString,
  creativity: decimalString,
  threat: decimalString,
  ict_index: decimalString,
  expected_goals: decimalString,
  expected_assists: decimalString,
  expected_goals_conceded: decimalString,
});

export const bootstrapSchema = z.object({
  events: z.array(eventSchema).min(1),
  teams: z.array(teamSchema).min(2),
  element_types: z.array(elementTypeSchema).min(1),
  elements: z.array(elementSchema).min(1),
});

export const fixtureSchema = z.object({
  id: z.number().int().positive(),
  // Postponed fixtures have no gameweek or kickoff until they are rescheduled.
  event: z.number().int().positive().nullable(),
  kickoff_time: z.string().nullable(),
  started: z.boolean().nullable(),
  finished: z.boolean(),
  team_h: z.number().int().positive(),
  team_a: z.number().int().positive(),
  team_h_difficulty: z.number().int(),
  team_a_difficulty: z.number().int(),
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
  expected_goals: decimalString,
  expected_assists: decimalString,
});

export const elementSummarySchema = z.object({
  history: z.array(historyEntrySchema),
});

export const snapshotSchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  /** How this snapshot's element summaries were produced. */
  mode: z.enum(["full", "incremental"]),
  bootstrap: bootstrapSchema,
  fixtures: fixturesSchema,
  /** element-summary per player id (as a string key, since this is JSON). */
  summaries: z.record(z.string().regex(/^\d+$/), elementSummarySchema),
});

export type FplEvent = z.infer<typeof eventSchema>;
export type Team = z.infer<typeof teamSchema>;
export type ElementType = z.infer<typeof elementTypeSchema>;
export type Element = z.infer<typeof elementSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type ElementSummary = z.infer<typeof elementSummarySchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

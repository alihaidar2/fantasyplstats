// Zod schemas for the per-gameweek endpoints the recap reads:
// event/{gw}/live/, event-status/, dream-team/{gw}/ and fixtures/?event={gw}.
// See docs/fpl-api.md. Unknown keys are stripped, as in schemas.ts.

import { z } from "zod";
import { decimalString, fixtureSchema } from "./schemas";

const playerId = z.number().int().positive();

/** One player's totals for a gameweek (both matches added together in a double gameweek). */
export const liveStatsSchema = z.object({
  minutes: z.number().int(),
  starts: z.number().int(),
  goals_scored: z.number().int(),
  assists: z.number().int(),
  clean_sheets: z.number().int(),
  goals_conceded: z.number().int(),
  own_goals: z.number().int(),
  penalties_saved: z.number().int(),
  penalties_missed: z.number().int(),
  yellow_cards: z.number().int(),
  red_cards: z.number().int(),
  saves: z.number().int(),
  bonus: z.number().int(),
  bps: z.number().int(),
  clearances_blocks_interceptions: z.number().int(),
  recoveries: z.number().int(),
  tackles: z.number().int(),
  defensive_contribution: z.number().int(),
  expected_goals: decimalString,
  expected_assists: decimalString,
  expected_goal_involvements: decimalString,
  expected_goals_conceded: decimalString,
  total_points: z.number().int(),
  in_dreamteam: z.boolean(),
});

/** Where a player's points came from in one fixture, e.g. `{identifier: "goals_scored", value: 2, points: 12}`. */
export const liveExplainSchema = z.object({
  fixture: z.number().int().positive(),
  stats: z.array(
    z.object({
      identifier: z.string().min(1),
      points: z.number().int(),
      value: z.number().int(),
    }),
  ),
});

/**
 * event/{gw}/live/. It lists the players who existed that gameweek, and is
 * `{"elements": []}` for a gameweek that hasn't been played.
 */
export const eventLiveSchema = z.object({
  elements: z.array(
    z.object({
      id: playerId,
      stats: liveStatsSchema,
      /** One entry per fixture the player's team had: none in a blank gameweek, two in a double. */
      explain: z.array(liveExplainSchema),
    }),
  ),
});

/**
 * event-status/. It only describes the current gameweek, one row per match
 * day. `points` is "" before the day's matches, "p" while provisional and
 * "r" once confirmed.
 */
export const eventStatusSchema = z.object({
  status: z.array(
    z.object({
      event: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date"),
      points: z.string(),
      bonus_added: z.boolean(),
    }),
  ),
  leagues: z.string(),
});

/** dream-team/{gw}/: the gameweek's top-scoring XI. */
export const dreamTeamSchema = z.object({
  top_player: z.object({ id: playerId, points: z.number().int() }).nullable(),
  team: z.array(
    z.object({
      element: playerId,
      points: z.number().int(),
      position: z.number().int().positive(),
    }),
  ),
});

const fixtureStatSchema = z.object({ value: z.number().int(), element: playerId });

/** A fixture from fixtures/?event={gw}: the snapshot's fields plus who did what. */
export const gameweekFixtureSchema = fixtureSchema.extend({
  finished_provisional: z.boolean(),
  minutes: z.number().int(),
  /** Per-player stats (goals_scored, assists, bonus, ...) split by home and away. */
  stats: z.array(
    z.object({
      identifier: z.string().min(1),
      h: z.array(fixtureStatSchema),
      a: z.array(fixtureStatSchema),
    }),
  ),
});

export const gameweekFixturesSchema = z.array(gameweekFixtureSchema);

export type LiveStats = z.infer<typeof liveStatsSchema>;
export type LiveExplain = z.infer<typeof liveExplainSchema>;
export type EventLive = z.infer<typeof eventLiveSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type DreamTeam = z.infer<typeof dreamTeamSchema>;
export type GameweekFixture = z.infer<typeof gameweekFixtureSchema>;

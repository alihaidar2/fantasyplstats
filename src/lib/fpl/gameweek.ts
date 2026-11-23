// Zod schemas for the per-gameweek endpoints the recap reads:
// event/{gw}/live/, event-status/, dream-team/{gw}/ and fixtures/?event={gw}.
// See docs/fpl-api.md. Unknown keys are stripped, as in schemas.ts.

import { z } from "zod";
import { decimalString, fixtureSchema } from "./schemas";

const playerId = z.number().int().positive();

/**
 * One player's totals for a gameweek (both matches added together in a double
 * gameweek). The fields the snapshot doesn't keep are optional, so an FPL
 * rename can't fail every deploy.
 */
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
  clearances_blocks_interceptions: z.number().int().optional(),
  recoveries: z.number().int().optional(),
  tackles: z.number().int().optional(),
  defensive_contribution: z.number().int(),
  expected_goals: decimalString.optional(),
  expected_assists: decimalString.optional(),
  expected_goal_involvements: decimalString.optional(),
  expected_goals_conceded: decimalString.optional(),
  total_points: z.number().int(),
  in_dreamteam: z.boolean().optional(),
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

/**
 * A fixture from fixtures/?event={gw}. Since snapshot version 4 the snapshot
 * keeps the same fields (including `stats`) for every fixture, so this is the
 * snapshot's fixture schema under the name the recap code uses.
 */
export const gameweekFixtureSchema = fixtureSchema;

export const gameweekFixturesSchema = z.array(gameweekFixtureSchema);

/**
 * The per-player stats the snapshot keeps from event/{current}/live/: what a
 * live points page needs, without the ICT, expected and defensive sub-stats.
 */
export const snapshotLiveStatsSchema = liveStatsSchema.pick({
  minutes: true,
  starts: true,
  goals_scored: true,
  assists: true,
  clean_sheets: true,
  goals_conceded: true,
  own_goals: true,
  penalties_saved: true,
  penalties_missed: true,
  yellow_cards: true,
  red_cards: true,
  saves: true,
  bonus: true,
  bps: true,
  defensive_contribution: true,
  total_points: true,
});

/** The keys of `snapshotLiveStatsSchema`, in order. */
export const SNAPSHOT_LIVE_STATS = Object.keys(snapshotLiveStatsSchema.shape) as (keyof SnapshotLiveStats)[];

/**
 * The current gameweek's live data as the snapshot keeps it: event/{gw}/live/
 * trimmed to `snapshotLiveStatsSchema` plus the points breakdown, and without
 * players whose stats are all zero (an absent player has 0 of everything so
 * far), alongside event-status/ as fetched.
 */
export const snapshotLiveSchema = z.object({
  gameweek: z.number().int().positive(),
  elements: z.array(
    z.object({
      id: playerId,
      stats: snapshotLiveStatsSchema,
      explain: z.array(liveExplainSchema),
    }),
  ),
  /** event-status/ as fetched. Its rows name their own gameweek, which can differ from `gameweek` between gameweeks. */
  status: eventStatusSchema,
});

export type LiveStats = z.infer<typeof liveStatsSchema>;
export type SnapshotLiveStats = z.infer<typeof snapshotLiveStatsSchema>;
export type SnapshotLive = z.infer<typeof snapshotLiveSchema>;
export type LiveExplain = z.infer<typeof liveExplainSchema>;
export type EventLive = z.infer<typeof eventLiveSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type DreamTeam = z.infer<typeof dreamTeamSchema>;
export type GameweekFixture = z.infer<typeof gameweekFixtureSchema>;

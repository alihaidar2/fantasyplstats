// The snapshot file the build reads (.data/snapshot.json). It lives apart from
// schemas.ts because it combines those schemas with the per-gameweek ones in
// gameweek.ts, which import schemas.ts themselves.

import { z } from "zod";
import { dreamTeamSchema, snapshotLiveSchema } from "./gameweek";
import { bootstrapSchema, elementSummarySchema, fixturesSchema } from "./schemas";

/**
 * Bump when the snapshot shape changes, so an older cached snapshot fails
 * validation and the next fetch refetches everything.
 *
 * - 2: per-gameweek history fields (step 5a).
 * - 3: fixture scores, `known_name`, `ranked_count` (step 5b).
 * - 4: per-fixture match stats, teams of the week, live data for the current gameweek (step 6a).
 */
export const SNAPSHOT_VERSION = 4;

const idKey = z.string().regex(/^\d+$/);

export const snapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  generatedAt: z.iso.datetime(),
  /** How this snapshot's element summaries were produced. */
  mode: z.enum(["full", "incremental"]),
  bootstrap: bootstrapSchema,
  /** Every fixture of the season, with per-player match stats once it has kicked off. */
  fixtures: fixturesSchema,
  /** element-summary per player id (as a string key, since this is JSON). */
  summaries: z.record(idKey, elementSummarySchema),
  /**
   * dream-team/{gw}/ per gameweek (string key), for settled gameweeks only
   * (`finished` and `data_checked`). A gameweek that isn't settled has no entry.
   */
  dreamTeams: z.record(idKey, dreamTeamSchema),
  /** The current gameweek's live data, refreshed on every build. Null when no gameweek is current (pre-season). */
  live: snapshotLiveSchema.nullable(),
  /**
   * The latest settled gameweek's live data, kept only while the current
   * gameweek's has no points breakdown yet (between its deadline and its first
   * kickoff), so /points/ still has the points FPL awarded to learn from.
   */
  previousLive: snapshotLiveSchema.nullish(),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

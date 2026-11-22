// An FplClient that serves the recorded responses in test/fixtures/ instead of
// calling FPL. scripts/fixture-snapshot.ts uses it to build the snapshot the CI
// workflow builds from, so PR checks never depend on the live API.

import {
  buildSnapshot,
  type BuildSnapshotResult,
  type ElementSummary,
  type FplClient,
} from "../src/lib/fpl";
import { loadBootstrap, loadFixtures, loadSummary } from "./helpers";

/** Players with a recorded element-summary-<id>.json in test/fixtures/. */
export const RECORDED_SUMMARY_IDS = [1, 430] as const;

export function createFixtureClient(): FplClient {
  const bootstrap = loadBootstrap();
  const teamOf = new Map(bootstrap.elements.map((e) => [e.id, e.team]));
  const recorded = new Map(RECORDED_SUMMARY_IDS.map((id) => [id as number, loadSummary(id)]));

  return {
    getBootstrap: async () => loadBootstrap(),
    getFixtures: async () => loadFixtures(),
    getElementSummary: async (id): Promise<ElementSummary> => {
      const own = recorded.get(id);
      if (own) return structuredClone(own);
      // Only a few summaries are recorded, but parseSnapshot needs one for
      // every player. A recorded teammate's history has the right opponents,
      // home/away and kickoffs for this player's team, so the player page
      // chart looks realistic (the points are the teammate's). Otherwise an
      // empty history (no games played yet) is valid and renders an empty chart.
      const teammate = RECORDED_SUMMARY_IDS.find((r) => teamOf.get(r) === teamOf.get(id));
      return teammate ? structuredClone(recorded.get(teammate)!) : { history: [] };
    },
  };
}

/** A full, validated snapshot built only from test/fixtures/. */
export function buildFixtureSnapshot(now = new Date()): Promise<BuildSnapshotResult> {
  return buildSnapshot({ client: createFixtureClient(), previous: null, now, forceFull: true });
}

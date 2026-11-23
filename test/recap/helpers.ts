import { readFileSync } from "node:fs";
import path from "node:path";
import {
  dreamTeamSchema,
  eventLiveSchema,
  eventStatusSchema,
  gameweekFixturesSchema,
  parseSnapshot,
  type Snapshot,
} from "../../src/lib/fpl";
import { buildGameweekContext, type GameweekContext, type GameweekSources } from "../../src/lib/recap/context";

/** Sources whose season data is a full snapshot, so tests can edit any of its fields. */
export interface SnapshotSources extends GameweekSources {
  snapshot: Snapshot;
}

/** The gameweeks recorded in test/fixtures/recap/. */
export type RecordedGameweek = 3 | 4;

/** A fresh, unparsed copy of a recorded response in test/fixtures/recap/. */
export function loadRecapRaw(name: string): unknown {
  return JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", "recap", name), "utf8"));
}

/**
 * Fresh, validated copies of everything a context is built from, so a test
 * can edit them (a double gameweek, a transfer, a missing live entry) before
 * building. The recorded event-status describes a later gameweek, as it would
 * when replaying a past one.
 */
export function loadSources(gameweek: RecordedGameweek = 3): SnapshotSources {
  return {
    snapshot: parseSnapshot(loadRecapRaw("snapshot.json")),
    live: eventLiveSchema.parse(loadRecapRaw(`live-${gameweek}.json`)),
    fixtures: gameweekFixturesSchema.parse(loadRecapRaw(`fixtures-${gameweek}.json`)),
    dreamTeam: dreamTeamSchema.parse(loadRecapRaw(`dream-team-${gameweek}.json`)),
    eventStatus: eventStatusSchema.parse(loadRecapRaw("event-status.json")),
  };
}

/** A context for a recorded gameweek, optionally from edited sources. */
export function loadContext(
  gameweek: RecordedGameweek = 3,
  edit?: (sources: SnapshotSources) => void,
): GameweekContext {
  const sources = loadSources(gameweek);
  edit?.(sources);
  return buildGameweekContext(gameweek, sources);
}

const LIVE_DECIMALS = ["expected_goals", "expected_assists", "expected_goal_involvements", "expected_goals_conceded"] as const;

/**
 * Turns one of the gameweek's fixtures into a double: both clubs play the
 * same match twice. Every source is edited consistently (fixtures, history
 * rows, live totals and points breakdowns). Returns the new fixture's id.
 */
export function makeDouble(sources: SnapshotSources, fixtureId: number): number {
  const newId = 9000 + fixtureId;
  const fixture = sources.fixtures.find((f) => f.id === fixtureId);
  const inSnapshot = sources.snapshot.fixtures.find((f) => f.id === fixtureId);
  if (!fixture || !inSnapshot) throw new Error(`Fixture ${fixtureId} is not in the recorded gameweek.`);
  sources.fixtures.push({ ...structuredClone(fixture), id: newId });
  sources.snapshot.fixtures.push({ ...inSnapshot, id: newId });

  for (const summary of Object.values(sources.snapshot.summaries)) {
    const rows = summary.history.filter((h) => h.fixture === fixtureId);
    for (const row of rows) summary.history.splice(summary.history.indexOf(row) + 1, 0, { ...row, fixture: newId });
  }
  for (const element of sources.live.elements) {
    const part = element.explain.find((x) => x.fixture === fixtureId);
    if (!part) continue;
    element.explain.push({ ...structuredClone(part), fixture: newId });
    const stats = element.stats as unknown as Record<string, number | string | boolean>;
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === "number") stats[key] = value * 2;
    }
    for (const key of LIVE_DECIMALS) stats[key] = (Number(element.stats[key]) * 2).toFixed(2);
  }
  return newId;
}

/**
 * Postpones one of the gameweek's fixtures, so both clubs have a blank
 * gameweek: no fixture, no history row, and an empty line in the live data.
 */
export function makeBlank(sources: SnapshotSources, fixtureId: number): void {
  if (!sources.fixtures.some((f) => f.id === fixtureId)) {
    throw new Error(`Fixture ${fixtureId} is not in the recorded gameweek.`);
  }
  sources.fixtures = sources.fixtures.filter((f) => f.id !== fixtureId);
  const inSnapshot = sources.snapshot.fixtures.find((f) => f.id === fixtureId)!;
  Object.assign(inSnapshot, {
    event: null, kickoff_time: null, started: false, finished: false, team_h_score: null, team_a_score: null,
  });

  for (const summary of Object.values(sources.snapshot.summaries)) {
    summary.history = summary.history.filter((h) => h.fixture !== fixtureId);
  }
  const blanked = new Set<number>();
  for (const element of sources.live.elements) {
    if (!element.explain.some((x) => x.fixture === fixtureId)) continue;
    blanked.add(element.id);
    element.explain = [];
    const stats = element.stats as unknown as Record<string, number | string | boolean>;
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === "number") stats[key] = 0;
    }
    for (const key of LIVE_DECIMALS) stats[key] = "0.00";
    stats.in_dreamteam = false;
  }
  sources.dreamTeam.team = sources.dreamTeam.team.filter((d) => !blanked.has(d.element));
}

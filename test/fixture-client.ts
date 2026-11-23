// An FPL client that serves the recorded responses in test/fixtures/ instead of
// calling FPL. scripts/fixture-snapshot.ts uses it to build the snapshot the CI
// workflow builds from, so PR checks never depend on the live API.
//
// The base is test/fixtures/ (6 players, gameweeks 1–6, GW3 current, so GW1
// and GW2 are settled). On top of it, the recorded gameweeks in
// test/fixtures/gameweeks/ supply what snapshot version 4 keeps: per-match
// stats for the 60 fixtures, teams of the week, and GW3's live data. Every
// player those name is added to the bootstrap, so the data stays complete:
//   - with their real bootstrap row from test/fixtures/recap/snapshot.json
//     when it has one (recorded 23 Nov 2026);
//   - otherwise built from their identity in gameweeks/bootstrap-static.json,
//     with price and season totals taken from their recorded history.
// Every player gets their real history from gameweeks/element-history.json, up
// to the current gameweek (players 1 and 430 keep their own recordings).

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildSnapshot,
  dreamTeamSchema,
  elementSchema,
  elementSummarySchema,
  eventLiveSchema,
  eventStatusSchema,
  FplRequestError,
  fixturesSchema,
  historyEntrySchema,
  type Bootstrap,
  type BuildSnapshotResult,
  type DreamTeam,
  type Element,
  type ElementSummary,
  type EventLive,
  type EventStatus,
  type Fixture,
  type HistoryEntry,
  type SnapshotClient,
} from "../src/lib/fpl";
import { loadBootstrap, loadFixtures, loadSummary } from "./helpers";

/** Players with a recorded element-summary-<id>.json in test/fixtures/. */
export const RECORDED_SUMMARY_IDS = [1, 430] as const;

/** Gameweeks of test/fixtures/fixtures.json that test/fixtures/gameweeks/ recorded. */
const RECORDED_GAMEWEEKS = [1, 2, 3, 4, 5, 6] as const;

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURES_DIR, ...parts), "utf8"));
const gameweekDir = (gw: number) => `gw${String(gw).padStart(2, "0")}`;

/** The raw recorded responses for one gameweek in test/fixtures/gameweeks/. */
export function loadRecordedGameweek(gw: number): { fixtures: Fixture[]; live: EventLive; dreamTeam: DreamTeam } {
  return {
    fixtures: fixturesSchema.parse(readJson("gameweeks", gameweekDir(gw), "fixtures.json")),
    live: eventLiveSchema.parse(readJson("gameweeks", gameweekDir(gw), "live.json")),
    dreamTeam: dreamTeamSchema.parse(readJson("gameweeks", gameweekDir(gw), "dream-team.json")),
  };
}

const notFound = (what: string) =>
  new FplRequestError(`Request to ${what} returned HTTP 404 (not recorded)`, what, 404);

const ukDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Season totals for a player we only know the identity of, from their recorded history. */
function elementFromIdentity(identity: Record<string, unknown>, history: HistoryEntry[]): Element {
  const sum = (key: keyof HistoryEntry) => history.reduce((n, h) => n + Number(h[key]), 0);
  const decimal = (n: number) => n.toFixed(2);
  return elementSchema.parse({
    ...identity,
    known_name: "",
    status: "a",
    news: "",
    chance_of_playing_next_round: null,
    now_cost: history.at(-1)?.value ?? 45,
    cost_change_event: 0,
    cost_change_start: 0,
    transfers_in_event: 0,
    transfers_out_event: 0,
    total_points: sum("total_points"),
    points_per_game: decimal(history.length ? sum("total_points") / history.length : 0),
    form: "0.0",
    selected_by_percent: "0.0",
    minutes: sum("minutes"),
    starts: 0,
    goals_scored: sum("goals_scored"),
    assists: sum("assists"),
    clean_sheets: 0,
    goals_conceded: 0,
    own_goals: 0,
    penalties_missed: 0,
    yellow_cards: 0,
    red_cards: 0,
    saves: 0,
    saves_per_90: 0,
    bonus: sum("bonus"),
    bps: sum("bps"),
    defensive_contribution: sum("defensive_contribution"),
    defensive_contribution_per_90: 0,
    clearances_blocks_interceptions: 0,
    tackles: 0,
    recoveries: 0,
    influence: "0.0",
    creativity: "0.0",
    threat: "0.0",
    ict_index: "0.0",
    expected_goals: decimal(sum("expected_goals")),
    expected_assists: decimal(sum("expected_assists")),
    expected_goal_involvements: decimal(sum("expected_goals") + sum("expected_assists")),
    expected_goals_conceded: "0.00",
    expected_goals_per_90: 0,
    expected_assists_per_90: 0,
    expected_goal_involvements_per_90: 0,
    expected_goals_conceded_per_90: 0,
    penalties_order: null,
    direct_freekicks_order: null,
    corners_and_indirect_freekicks_order: null,
  });
}

interface FixtureData {
  bootstrap: Bootstrap;
  fixtures: Fixture[];
  summaries: Map<number, ElementSummary>;
  dreamTeams: Map<number, DreamTeam>;
  live: Map<number, EventLive>;
  eventStatus: EventStatus;
}

function loadFixtureData(): FixtureData {
  const bootstrap = loadBootstrap();
  const current = bootstrap.events.find((e) => e.is_current)!.id;

  // Match stats from the recorded gameweeks, onto test/fixtures/fixtures.json.
  const recorded = new Map(RECORDED_GAMEWEEKS.map((gw) => [gw as number, loadRecordedGameweek(gw)]));
  const statsById = new Map(
    [...recorded.values()].flatMap((r) => r.fixtures).map((f) => [f.id, f.stats] as const),
  );
  const fixtures = loadFixtures().map((f) => ({ ...f, stats: structuredClone(statsById.get(f.id) ?? f.stats) }));

  const settled = bootstrap.events.filter((e) => e.finished && e.data_checked).map((e) => e.id);
  const dreamTeams = new Map(settled.map((gw) => [gw, recorded.get(gw)!.dreamTeam]));
  const live = new Map([[current, recorded.get(current)!.live]]);

  // event-status/ as recorded (when GW11 was current), moved onto the current
  // gameweek's match days so it describes the current gameweek.
  const status = eventStatusSchema.parse(readJson("recap", "event-status.json"));
  const days = [...new Set(fixtures.filter((f) => f.event === current && f.kickoff_time).map((f) => ukDate(f.kickoff_time!)))].sort();
  const eventStatus: EventStatus = {
    ...status,
    status: days.map((date) => ({ ...status.status[0], event: current, date })),
  };

  // Every player the match stats, teams of the week and live data name.
  const named = new Set<number>();
  for (const f of fixtures) for (const s of f.stats) for (const r of [...s.h, ...s.a]) named.add(r.element);
  for (const team of dreamTeams.values()) for (const d of team.team) named.add(d.element);
  for (const gw of live.values()) for (const e of gw.elements) named.add(e.id);

  const history = readJson("gameweeks", "element-history.json") as Record<string, unknown[]>;
  const historyOf = (id: number): HistoryEntry[] =>
    (history[id] ?? []).map((h) => historyEntrySchema.parse(h)).filter((h) => h.round <= current);

  const fullRows = new Map(
    (readJson("recap", "snapshot.json") as { bootstrap: { elements: unknown[] } }).bootstrap.elements
      .map((e) => elementSchema.parse(e))
      .map((e) => [e.id, e]),
  );
  const identities = new Map(
    (readJson("gameweeks", "bootstrap-static.json") as { elements: { id: number }[] }).elements.map((e) => [e.id, e]),
  );
  const have = new Set(bootstrap.elements.map((e) => e.id));
  for (const id of [...named].sort((a, b) => a - b)) {
    if (have.has(id)) continue;
    const identity = identities.get(id);
    if (!identity) throw new Error(`Player ${id} is in the recorded gameweeks but not in their bootstrap.`);
    bootstrap.elements.push(fullRows.get(id) ?? elementFromIdentity(identity, historyOf(id)));
  }

  const summaries = new Map<number, ElementSummary>();
  for (const e of bootstrap.elements) {
    const own = (RECORDED_SUMMARY_IDS as readonly number[]).includes(e.id);
    summaries.set(e.id, own ? loadSummary(e.id) : elementSummarySchema.parse({ history: historyOf(e.id) }));
  }

  return { bootstrap, fixtures, summaries, dreamTeams, live, eventStatus };
}

export function createFixtureClient(): SnapshotClient {
  const data = loadFixtureData();
  return {
    getBootstrap: async () => structuredClone(data.bootstrap),
    getFixtures: async () => structuredClone(data.fixtures),
    getElementSummary: async (id) => {
      const summary = data.summaries.get(id);
      if (!summary) throw notFound(`element-summary/${id}/`);
      return structuredClone(summary);
    },
    getDreamTeam: async (gw) => {
      const team = data.dreamTeams.get(gw);
      if (!team) throw notFound(`dream-team/${gw}/`);
      return structuredClone(team);
    },
    // Like FPL, an unplayed gameweek has no live elements.
    getEventLive: async (gw) => structuredClone(data.live.get(gw) ?? { elements: [] }),
    getEventStatus: async () => structuredClone(data.eventStatus),
  };
}

/** A full, validated snapshot built only from test/fixtures/. */
export function buildFixtureSnapshot(now = new Date()): Promise<BuildSnapshotResult> {
  return buildSnapshot({ client: createFixtureClient(), previous: null, now, forceFull: true });
}

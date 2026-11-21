import { describe, expect, it } from "vitest";
import {
  averageDifficulty,
  buildFixtureMatrix,
  buildHealth,
  buildPlayerDetail,
  buildPlayerRows,
  bootstrapSchema,
  defaultGameweek,
  formatUpdatedAt,
  weekSortValue,
  type FplEvent,
  type Snapshot,
} from "../src/lib/fpl";
import { ARSENAL, loadBootstrap, loadFixtures, loadRaw, loadSummary } from "./helpers";

const event = (id: number, flags: Partial<FplEvent> = {}): FplEvent => ({
  id,
  name: `Gameweek ${id}`,
  deadline_time: null,
  finished: false,
  is_previous: false,
  is_current: false,
  is_next: false,
  ...flags,
});

describe("schemas", () => {
  it("parse recorded responses and strip fields the site does not use", () => {
    const bootstrap = loadBootstrap();
    expect(bootstrap.teams).toHaveLength(20);
    expect(bootstrap).not.toHaveProperty("game_settings");
    expect(bootstrap.elements[0]).not.toHaveProperty("price_change_projections");
    expect(loadFixtures()[0]).not.toHaveProperty("stats");
  });

  it("reject a response with a renamed field", () => {
    const raw = loadRaw("bootstrap-static.json") as { elements: Record<string, unknown>[] };
    raw.elements[0].cost = raw.elements[0].now_cost;
    delete raw.elements[0].now_cost;
    expect(bootstrapSchema.safeParse(raw).success).toBe(false);
  });
});

describe("defaultGameweek", () => {
  it("prefers the next gameweek", () => {
    expect(defaultGameweek([event(1), event(2, { is_current: true }), event(3, { is_next: true })])).toBe(3);
  });

  it("falls back to the current gameweek, then the last", () => {
    expect(defaultGameweek([event(1), event(2, { is_current: true }), event(3)])).toBe(2);
    expect(defaultGameweek([event(1), event(2), event(3)])).toBe(3);
  });
});

describe("buildFixtureMatrix", () => {
  it("opens on the next gameweek with every team sorted by short name", () => {
    const matrix = buildFixtureMatrix(loadBootstrap(), loadFixtures());
    expect(matrix.gameweeks).toBe(6);
    expect(matrix.defaultRange).toEqual([4, 6]);
    const teams = matrix.rows.map((r) => r.team);
    expect(teams).toHaveLength(20);
    expect(teams).toEqual([...teams].sort((a, b) => a.localeCompare(b)));
  });

  it("puts each fixture in both teams' rows with their own difficulty", () => {
    const matrix = buildFixtureMatrix(loadBootstrap(), loadFixtures());
    const ars = matrix.rows.find((r) => r.team === "ARS")!;
    const lee = matrix.rows.find((r) => r.team === "LEE")!;
    // Fixture 51: ARS v LEE in GW6, difficulty 3 for ARS and 5 for LEE.
    expect(ars.weeks[5]).toEqual([{ opponent: "LEE", home: true, difficulty: 3 }]);
    expect(lee.weeks[5]).toEqual([{ opponent: "ARS", home: false, difficulty: 5 }]);
  });

  it("keeps both fixtures of a double gameweek and averages over every fixture", () => {
    const fixtures = loadFixtures();
    // Move ARS v LEE (GW6, difficulty 3) into GW5, where ARS already play away (difficulty 4).
    fixtures.find((f) => f.id === 51)!.event = 5;
    const ars = buildFixtureMatrix(loadBootstrap(), fixtures).rows.find((r) => r.team === "ARS")!;

    expect(ars.weeks[4].map((f) => [f.opponent, f.difficulty])).toEqual([
      ["BHA", 4],
      ["LEE", 3],
    ]);
    expect(ars.weeks[5]).toEqual([]);
    // GW5 has two fixtures (4 and 3), GW6 is blank: (4 + 3) / 2, not 3 or 7.
    expect(averageDifficulty(ars, 5, 6)).toBe(3.5);
    // GW4 (3) + both GW5 fixtures: (3 + 4 + 3) / 3.
    expect(averageDifficulty(ars, 4, 5)).toBeCloseTo(10 / 3);
  });

  it("leaves a blank gameweek empty and out of the average", () => {
    const fixtures = loadFixtures().filter((f) => f.id !== 51);
    const ars = buildFixtureMatrix(loadBootstrap(), fixtures).rows.find((r) => r.team === "ARS")!;
    expect(ars.weeks[5]).toEqual([]);
    expect(averageDifficulty(ars, 6, 6)).toBeUndefined();
    expect(averageDifficulty(ars, 5, 6)).toBe(4);
  });

  it("skips postponed fixtures that have no gameweek", () => {
    const fixtures = loadFixtures();
    const postponed = fixtures.find((f) => f.id === 51)!;
    postponed.event = null;
    postponed.kickoff_time = null;
    const ars = buildFixtureMatrix(loadBootstrap(), fixtures).rows.find((r) => r.team === "ARS")!;
    expect(ars.weeks.flat()).toHaveLength(5);
  });

  it("clamps the default range at the end of the season", () => {
    const bootstrap = loadBootstrap();
    bootstrap.events = bootstrap.events.map((e) => ({ ...e, is_current: e.id === 6, is_next: false }));
    expect(buildFixtureMatrix(bootstrap, loadFixtures()).defaultRange).toEqual([6, 6]);
  });
});

describe("weekSortValue", () => {
  it("ranks a blank as hardest and a double by its mean", () => {
    expect(weekSortValue([])).toBe(6);
    expect(
      weekSortValue([
        { opponent: "A", home: true, difficulty: 2 },
        { opponent: "B", home: false, difficulty: 5 },
      ]),
    ).toBe(3.5);
  });
});

describe("player view models", () => {
  it("builds slim table rows with names and numbers resolved", () => {
    const rows = buildPlayerRows(loadBootstrap());
    const raya = rows.find((r) => r.id === 1)!;
    expect(raya).toMatchObject({ team: "ARS", position: "GKP", positionId: 1 });
    expect(typeof raya.price).toBe("number");
    expect(typeof raya.form).toBe("number");
    expect(Object.keys(raya).sort()).toEqual(
      [
        "assists", "cleanSheets", "form", "goals", "id", "name", "pointsPerGame",
        "position", "positionId", "price", "selectedByPercent", "team", "totalPoints",
      ].sort(),
    );
  });

  it("sums a double gameweek's points in the player's history", () => {
    const bootstrap = loadBootstrap();
    const summary = loadSummary(1);
    const [first, second] = summary.history;
    summary.history = [first, { ...second, round: first.round }];
    const raya = bootstrap.elements.find((e) => e.id === 1)!;

    const detail = buildPlayerDetail(bootstrap, raya, summary);
    expect(detail.teamName).toBe("Arsenal");
    expect(detail.position).toBe("Goalkeeper");
    expect(detail.history[0]).toEqual({
      gameweek: first.round,
      points: first.total_points + second.total_points,
    });
    expect(detail.history).toHaveLength(summary.history.length - 1);
  });

  it("copes with a player who has no element-summary history yet", () => {
    const bootstrap = loadBootstrap();
    const detail = buildPlayerDetail(bootstrap, bootstrap.elements[0], { history: [] });
    expect(detail.history).toEqual([]);
  });
});

describe("site metadata", () => {
  it("reports freshness and gameweeks in health.json", () => {
    const bootstrap = loadBootstrap();
    const snapshot = { generatedAt: "2026-11-21T17:00:00.000Z", bootstrap } as Snapshot;
    expect(buildHealth(snapshot)).toEqual({
      generatedAt: "2026-11-21T17:00:00.000Z",
      currentGameweek: 3,
      nextGameweek: 4,
      players: bootstrap.elements.length,
    });
  });

  it("formats the update time in UK time across GMT and BST", () => {
    expect(formatUpdatedAt("2026-11-21T17:19:00Z")).toBe("21 Nov 2026, 17:19 UK time");
    expect(formatUpdatedAt("2026-08-21T17:19:00Z")).toBe("21 Aug 2026, 18:19 UK time");
  });
});

it("uses team ids that match the recorded data", () => {
  expect(loadBootstrap().teams.find((t) => t.id === ARSENAL)?.short_name).toBe("ARS");
});

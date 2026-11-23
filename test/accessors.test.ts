import { beforeAll, describe, expect, it } from "vitest";
import {
  EMPTY_LIVE_STATS,
  findFixture,
  fixturesInGameweek,
  liveGameweek,
  livePlayer,
  livePoints,
  matchStat,
  matchStatIdentifiers,
  matchStatRows,
  MATCH_STAT_IDENTIFIERS,
  playerMatchStats,
  settledGameweeks,
  teamOfTheWeek,
  teamsOfTheWeek,
  type Snapshot,
} from "../src/lib/fpl";
import { buildFixtureSnapshot } from "./fixture-client";

// The CI fixture snapshot: GW3 current, GW1–2 settled. Fixture 21 (GW3) is
// BRE 0–2 (team 12 v team 14); player 379 scored both goals.
let snapshot: Snapshot;
beforeAll(async () => {
  snapshot = (await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"))).snapshot;
});

describe("match stats", () => {
  it("finds fixtures and lists a gameweek's in kickoff order", () => {
    expect(findFixture(snapshot, 21)).toMatchObject({ event: 3, team_h: 12, team_a: 14, team_h_score: 0, team_a_score: 2 });
    expect(findFixture(snapshot, 9999)).toBeUndefined();
    expect(fixturesInGameweek(snapshot, 3).map((f) => f.id)).toEqual([21, 27, 22, 23, 24, 26, 28, 25, 30, 29]);
    expect(fixturesInGameweek(snapshot, 7)).toEqual([]);
  });

  it("reads one stat by side, highest first", () => {
    const fixture = findFixture(snapshot, 21)!;
    expect(matchStat(fixture, "goals_scored")).toEqual({ home: [], away: [{ element: 379, value: 2 }] });
    expect(matchStat(fixture, "bonus").away).toEqual([
      { element: 379, value: 3 },
      { element: 367, value: 2 },
      { element: 350, value: 1 },
    ]);
    expect(matchStat(fixture, "red_cards")).toEqual({ home: [], away: [] });
    expect(matchStat(fixture, "not_a_stat")).toEqual({ home: [], away: [] });
  });

  it("ranks a stat across both sides", () => {
    const rows = matchStatRows(findFixture(snapshot, 21)!, "bps");
    expect(rows.slice(0, 3)).toEqual([
      { element: 379, value: 61, side: "away" },
      { element: 367, value: 43, side: "away" },
      { element: 350, value: 35, side: "away" },
    ]);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].value).toBeGreaterThanOrEqual(rows[i].value);
    expect(rows.some((r) => r.side === "home")).toBe(true);
  });

  it("doesn't reorder the snapshot's own lists", () => {
    const fixture = findFixture(snapshot, 21)!;
    const before = JSON.stringify(fixture.stats);
    matchStatRows(fixture, "bps");
    matchStat(fixture, "saves");
    expect(JSON.stringify(fixture.stats)).toBe(before);
  });

  it("gives one player's line in a match", () => {
    const fixture = findFixture(snapshot, 21)!;
    expect(playerMatchStats(fixture, 379)).toEqual({ goals_scored: 2, bonus: 3, bps: 61, defensive_contribution: 3 });
    expect(playerMatchStats(fixture, 1)).toEqual({});
    expect(matchStatIdentifiers(fixture)).toEqual([...MATCH_STAT_IDENTIFIERS]);
  });
});

describe("team of the week", () => {
  it("is there for settled gameweeks only", () => {
    expect(settledGameweeks(snapshot.bootstrap.events)).toEqual([1, 2]);
    expect(teamOfTheWeek(snapshot, 3)).toBeNull();
    expect(teamsOfTheWeek(snapshot).map((t) => t.gameweek)).toEqual([1, 2]);
  });

  it("lists the XI in slot order with the top player and total", () => {
    const team = teamOfTheWeek(snapshot, 1)!;
    expect(team.topPlayer).toEqual({ id: 115, points: 17 });
    expect(team.players).toHaveLength(11);
    expect(team.players.map((p) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(team.players[0]).toEqual({ element: 572, points: 10, position: 1 });
    expect(team.totalPoints).toBe(148);
    // Slot 1 is the goalkeeper.
    expect(snapshot.bootstrap.elements.find((e) => e.id === 572)?.element_type).toBe(1);
  });
});

describe("live gameweek", () => {
  it("is the current gameweek's live data with its event-status days", () => {
    const live = liveGameweek(snapshot)!;
    expect(live.gameweek).toBe(3);
    expect(live.days.map((d) => d.date)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(live.bonusAdded).toBe(false);
    expect(live.leagues).toBe("");
  });

  it("gives a player's live stats and points breakdown", () => {
    const live = liveGameweek(snapshot)!;
    const player = livePlayer(live, 379);
    expect(player.stats).toMatchObject({ minutes: 63, goals_scored: 2, bonus: 3, bps: 61, total_points: 13 });
    expect(player.explain).toEqual([
      {
        fixture: 21,
        stats: [
          { identifier: "minutes", points: 2, value: 63 },
          { identifier: "goals_scored", points: 8, value: 2 },
          { identifier: "bonus", points: 3, value: 3 },
        ],
      },
    ]);
    expect(livePoints(live).get(379)).toBe(13);
  });

  it("gives zeros to a player with nothing so far", () => {
    const live = liveGameweek(snapshot)!;
    expect(live.players.has(5)).toBe(false);
    expect(livePlayer(live, 5)).toEqual({ id: 5, stats: EMPTY_LIVE_STATS, explain: [] });
    expect(livePoints(live).has(5)).toBe(false);
  });

  it("ignores event-status rows for another gameweek, and counts bonus as added once every day has it", () => {
    const status = structuredClone(snapshot.live!.status);
    const other = { ...snapshot, live: { ...snapshot.live!, status: { ...status, status: status.status.map((d) => ({ ...d, event: 4 })) } } };
    expect(liveGameweek(other)!.days).toEqual([]);
    expect(liveGameweek(other)!.bonusAdded).toBe(false);

    const done = { ...snapshot, live: { ...snapshot.live!, status: { ...status, status: status.status.map((d) => ({ ...d, bonus_added: true })) } } };
    expect(liveGameweek(done)!.bonusAdded).toBe(true);
  });

  it("is null before the season", () => {
    expect(liveGameweek({ live: null })).toBeNull();
  });
});

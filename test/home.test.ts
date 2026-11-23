import { describe, expect, it } from "vitest";
import { averageDifficulty, buildFixtureMatrix, parseSnapshot, type Snapshot } from "../src/lib/fpl";
import {
  buildHomePage,
  buildThisWeek,
  easiestFixtures,
  formatDeadline,
  HOME_LIST_LENGTH,
  mostTransferredIn,
  nextDeadline,
  priceMoves,
} from "../src/lib/home";
import type { Recap } from "../src/lib/recap/recap";
import { compareNewestFirst, toPublishedRecap } from "../src/lib/recaps";
import { buildFixtureSnapshot } from "./fixture-client";
import { loadRecapRaw } from "./recap/helpers";

/** The recorded 2026/27 snapshot: GW4 current, GW5 next, 355 players. */
const loadSnapshot = (): Snapshot => parseSnapshot(loadRecapRaw("snapshot.json"));
const sample = () => loadRecapRaw("sample-recap.json") as Recap;

describe("buildHomePage", () => {
  it("leads with the newest recap: headline, first paragraph and its gameweek stats", () => {
    const snapshot = loadSnapshot();
    const recaps = [
      toPublishedRecap({ ...sample(), gameweek: 3, headline: "Older" }),
      toPublishedRecap(sample()),
      toPublishedRecap({ ...sample(), season: "2025-26", gameweek: 38, headline: "Last season" }),
    ].sort(compareNewestFirst);

    const home = buildHomePage(snapshot, recaps);
    expect(home.latest?.recap.path).toBe("/recap/2026-27/gw4/");
    expect(home.latest?.recap.headline).toBe(sample().headline);
    expect(home.latest?.seasonLabel).toBe("2026/27");
    expect(home.latest?.firstParagraph).toBe(sample().paragraphs[0]);
    expect(home.latest?.stats).toMatchObject({ gameweek: 4, averageScore: 69, highestScore: 151 });
  });

  it("falls back to the 'this week' strip alone with no recap, which is the same either way", () => {
    const snapshot = loadSnapshot();
    const without = buildHomePage(snapshot, []);
    expect(without.latest).toBeNull();
    expect(without.thisWeek).toEqual(buildHomePage(snapshot, [toPublishedRecap(sample())]).thisWeek);
    expect(without.thisWeek.deadline?.gameweek).toBe(5);
    expect(without.thisWeek.easiestFixtures.length).toBeGreaterThan(0);
  });

  it("builds from the small CI snapshot too, with or without a recap", async () => {
    const { snapshot } = await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"));
    const without = buildHomePage(snapshot, []);
    expect(without.latest).toBeNull();
    expect(without.thisWeek.deadline?.gameweek).toBe(4);

    // The CI snapshot includes every player the recorded match stats name, so
    // GW4's top scorer and most-captained player are in it.
    const withRecap = buildHomePage(snapshot, [toPublishedRecap(sample())]);
    expect(withRecap.latest?.stats).toMatchObject({
      gameweek: 4,
      mostCaptained: { id: 411, name: "Haaland" },
      topScorer: { id: 124, points: 17 },
    });
  });
});

describe("this week", () => {
  it("shows the next deadline in UK time", () => {
    const deadline = nextDeadline(loadSnapshot().bootstrap.events);
    expect(deadline).toEqual({
      gameweek: 5,
      time: "2026-09-18T17:30:00Z",
      label: formatDeadline("2026-09-18T17:30:00Z"),
    });
    expect(formatDeadline("2026-09-18T17:30:00Z")).toMatch(/^Fri 18 Sept?, 18:30 UK time$/);
    expect(formatDeadline("2026-12-05T11:00:00Z")).toMatch(/^Sat 5 Dec, 11:00 UK time$/);
  });

  it("has no deadline once the season is over", () => {
    const snapshot = loadSnapshot();
    for (const e of snapshot.bootstrap.events) e.is_next = false;
    expect(buildThisWeek(snapshot).deadline).toBeNull();
  });

  it("ranks the easiest runs by the Fixtures page's average over its default range", () => {
    const snapshot = loadSnapshot();
    const { range, teams } = easiestFixtures(snapshot);
    const matrix = buildFixtureMatrix(snapshot.bootstrap, snapshot.fixtures);
    expect(range).toEqual(matrix.defaultRange);
    expect(teams).toHaveLength(HOME_LIST_LENGTH);

    const [from, to] = matrix.defaultRange;
    const all = matrix.rows.map((r) => averageDifficulty(r, from, to)!).sort((a, b) => a - b);
    expect(teams.map((t) => t.average)).toEqual(all.slice(0, HOME_LIST_LENGTH));
    for (const t of teams) {
      const row = matrix.rows.find((r) => r.team === t.team)!;
      expect(t.average).toBe(averageDifficulty(row, from, to));
      expect(t.weeks).toEqual(row.weeks.slice(from - 1, to));
      expect(t.name).not.toBe(t.team);
    }
  });

  it("puts a double gameweek ahead on a tie and leaves out teams with no fixtures", () => {
    const snapshot = loadSnapshot();
    const [from] = buildFixtureMatrix(snapshot.bootstrap, snapshot.fixtures).defaultRange;
    // Every fixture difficulty 3, then give one team an extra game in the first gameweek.
    for (const f of snapshot.fixtures) Object.assign(f, { team_h_difficulty: 3, team_a_difficulty: 3 });
    const first = snapshot.fixtures.find((f) => f.event === from)!;
    snapshot.fixtures.push({ ...first, id: 99999, team_h: first.team_a, team_a: first.team_h });
    const { teams } = easiestFixtures(snapshot, 20);
    const shortName = (id: number) => snapshot.bootstrap.teams.find((t) => t.id === id)!.short_name;
    expect(teams.slice(0, 2).map((t) => t.team).sort()).toEqual([shortName(first.team_h), shortName(first.team_a)].sort());

    snapshot.fixtures = snapshot.fixtures.filter((f) => f.event === null || f.event < from);
    expect(easiestFixtures(snapshot)).toEqual({ range: null, teams: [] });
  });

  it("lists the biggest price risers and fallers since the deadline", () => {
    const { bootstrap } = loadSnapshot();
    const { risers, fallers } = priceMoves(bootstrap);
    expect(risers.length).toBeGreaterThan(0);
    expect(fallers.length).toBeGreaterThan(0);
    expect(risers.length).toBeLessThanOrEqual(HOME_LIST_LENGTH);
    expect(risers.every((m) => m.change > 0)).toBe(true);
    expect(fallers.every((m) => m.change < 0)).toBe(true);
    expect(risers.map((m) => m.change)).toEqual([...risers.map((m) => m.change)].sort((a, b) => b - a));
    expect(fallers.map((m) => m.change)).toEqual([...fallers.map((m) => m.change)].sort((a, b) => a - b));

    const top = bootstrap.elements.find((e) => e.id === risers[0].id)!;
    expect(risers[0]).toMatchObject({
      price: top.now_cost / 10,
      change: top.cost_change_event / 10,
      path: `/players/${top.id}/`,
    });
  });

  it("breaks price ties by ownership", () => {
    const { bootstrap } = loadSnapshot();
    const [a, b] = bootstrap.elements;
    for (const e of bootstrap.elements) e.cost_change_event = 0;
    Object.assign(a, { cost_change_event: 1, selected_by_percent: "1.0" });
    Object.assign(b, { cost_change_event: 1, selected_by_percent: "20.0" });
    expect(priceMoves(bootstrap).risers.map((m) => m.id)).toEqual([b.id, a.id]);
    expect(priceMoves(bootstrap).fallers).toEqual([]);
  });

  it("lists the most transferred-in players", () => {
    const { bootstrap } = loadSnapshot();
    const players = mostTransferredIn(bootstrap);
    expect(players).toHaveLength(HOME_LIST_LENGTH);
    const expected = [...bootstrap.elements]
      .sort((a, b) => b.transfers_in_event - a.transfers_in_event)
      .slice(0, HOME_LIST_LENGTH)
      .map((e) => e.transfers_in_event);
    expect(players.map((p) => p.transfersIn)).toEqual(expected);
  });

  it("says which deadline the counters run from", () => {
    expect(buildThisWeek(loadSnapshot()).sinceGameweek).toBe(4);
  });
});

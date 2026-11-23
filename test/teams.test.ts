import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Element, Fixture, Snapshot } from "../src/lib/fpl";
import {
  averageFixtureDifficulty,
  buildClubPage,
  buildClubs,
  buildLeagueTable,
  clubDescription,
  clubResults,
  describeForm,
  describeResult,
  formatMatchDate,
  isInProgress,
  isResult,
  isUpcoming,
  ordinal,
  positionLabel,
  slugify,
  summarise,
  teamXgc,
  TOP_PLAYERS_LENGTH,
} from "../src/lib/stats/teams";
import { buildFixtureSnapshot, loadRecordedGameweek } from "./fixture-client";

// The CI fixture snapshot: 20 clubs, all 60 fixtures of GW1–6 finished (the
// recordings are from different days, so GW4–6 have results though GW3 is
// "current"), 436 players.
let snapshot: Snapshot;
beforeAll(async () => {
  snapshot = (await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"))).snapshot;
});

const clone = <T>(value: T): T => structuredClone(value);

// ─── A tiny synthetic league for the tie-breakers ───────────────────────────

const team = (id: number, name: string) => ({ id, code: 100 + id, name, short_name: name.slice(0, 3).toUpperCase() });

let nextId = 1;
function result(home: number, away: number, hs: number | null, as: number | null, extra: Partial<Fixture> = {}): Fixture {
  return {
    id: nextId++,
    event: 1,
    kickoff_time: `2026-08-${String(nextId).padStart(2, "0")}T14:00:00Z`,
    started: true,
    finished_provisional: true,
    finished: true,
    minutes: 90,
    team_h: home,
    team_a: away,
    team_h_score: hs,
    team_a_score: as,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    stats: [],
    ...extra,
  };
}

function tinySnapshot(teams: ReturnType<typeof team>[], fixtures: Fixture[]): Pick<Snapshot, "bootstrap" | "fixtures"> {
  return {
    bootstrap: { ...snapshot.bootstrap, teams: teams as Snapshot["bootstrap"]["teams"], elements: [] },
    fixtures,
  };
}

// ─── Slugs ──────────────────────────────────────────────────────────────────

describe("club slugs", () => {
  it("gives every recorded club a unique, readable slug", () => {
    const clubs = buildClubs(snapshot.bootstrap.teams);
    expect(clubs).toHaveLength(20);
    expect(new Set(clubs.map((c) => c.slug)).size).toBe(20);
    for (const c of clubs) {
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.path).toBe(`/teams/${c.slug}/`);
    }
    const bySlug = Object.fromEntries(clubs.map((c) => [c.name, [c.slug, c.fullName]]));
    expect(bySlug["Arsenal"]).toEqual(["arsenal", "Arsenal"]);
    expect(bySlug["Man City"]).toEqual(["manchester-city", "Manchester City"]);
    expect(bySlug["Man Utd"]).toEqual(["manchester-united", "Manchester United"]);
    expect(bySlug["Nott'm Forest"]).toEqual(["nottingham-forest", "Nottingham Forest"]);
    expect(bySlug["Spurs"]).toEqual(["tottenham-hotspur", "Tottenham Hotspur"]);
    expect(bySlug["Brighton"]).toEqual(["brighton-and-hove-albion", "Brighton & Hove Albion"]);
    expect(bySlug["Crystal Palace"]).toEqual(["crystal-palace", "Crystal Palace"]);
    expect(bySlug["Coventry City"]).toEqual(["coventry-city", "Coventry City"]);
  });

  it("keys slugs on the club code, so a new season's ids don't change URLs", () => {
    const [city] = buildClubs([{ id: 7, code: 43, name: "Man City", short_name: "MCI" }]);
    expect(city).toMatchObject({ id: 7, slug: "manchester-city", path: "/teams/manchester-city/" });
  });

  it("slugifies unknown names and keeps colliding slugs unique", () => {
    expect(slugify("Nott'm Forest")).toBe("nottm-forest");
    expect(slugify("Brighton & Hove")).toBe("brighton-and-hove");
    expect(slugify("  Atlético  Madrid! ")).toBe("atletico-madrid");
    const clubs = buildClubs([
      { id: 1, code: 900, name: "Town FC", short_name: "TWN" },
      { id: 2, code: 901, name: "Town F.C.", short_name: "TFC" },
    ]);
    expect(clubs.map((c) => c.slug).sort()).toEqual(["town-fc-900", "town-fc-901"]);
  });
});

// ─── Results ────────────────────────────────────────────────────────────────

describe("fixture states", () => {
  it("counts confirmed and provisional full-time results, not live or unplayed matches", () => {
    const confirmed = result(1, 2, 1, 0);
    const provisional = result(1, 2, 1, 0, { finished: false });
    const live = result(1, 2, 1, 0, { finished: false, finished_provisional: false, minutes: 60 });
    const unplayed = result(1, 2, null, null, { started: false, finished: false, finished_provisional: false, minutes: 0 });
    const postponed = { ...unplayed, event: null, kickoff_time: null };

    expect([confirmed, provisional, live, unplayed, postponed].map(isResult)).toEqual([true, true, false, false, false]);
    expect([confirmed, provisional, live, unplayed, postponed].map(isInProgress)).toEqual([false, false, true, false, false]);
    expect([confirmed, provisional, live, unplayed, postponed].map(isUpcoming)).toEqual([false, false, false, true, true]);
  });

  it("builds a club's results from its side of each fixture, oldest first", () => {
    const fixtures = [result(2, 1, 3, 1), result(1, 3, 0, 0), result(1, 2, 2, 0)];
    const results = clubResults(fixtures, 1);
    expect(results.map((r) => [r.home, r.goalsFor, r.goalsAgainst, r.outcome, r.opponentId])).toEqual([
      [false, 1, 3, "L", 2],
      [true, 0, 0, "D", 3],
      [true, 2, 0, "W", 2],
    ]);
    expect(summarise(results)).toEqual({
      played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, points: 4, cleanSheets: 2,
    });
  });
});

// ─── League table ───────────────────────────────────────────────────────────

describe("buildLeagueTable on the recorded results", () => {
  it("adds up: every result counted once for each side", () => {
    const table = buildLeagueTable(snapshot);
    expect(table.rows).toHaveLength(20);
    expect(table.results).toBe(60);
    expect(table.provisional).toBe(0);
    expect(table.inProgress).toBe(0);
    expect(table.seasonComplete).toBe(false);

    const sum = (key: "played" | "won" | "lost" | "drawn" | "goalsFor" | "goalsAgainst" | "goalDifference") =>
      table.rows.reduce((n, r) => n + r[key], 0);
    expect(sum("played")).toBe(120);
    expect(sum("won")).toBe(sum("lost"));
    expect(sum("drawn") % 2).toBe(0);
    expect(sum("goalsFor")).toBe(sum("goalsAgainst"));
    expect(sum("goalDifference")).toBe(0);
    for (const r of table.rows) {
      expect(r.won + r.drawn + r.lost).toBe(r.played);
      expect(r.points).toBe(r.won * 3 + r.drawn);
      expect(r.form).toHaveLength(5);
    }
  });

  it("orders by points, goal difference, then goals scored", () => {
    const { rows } = buildLeagueTable(snapshot);
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1], rows[i]];
      const order = Math.sign(b.points - a.points) || Math.sign(b.goalDifference - a.goalDifference) || Math.sign(b.goalsFor - a.goalsFor);
      expect(order).toBeLessThanOrEqual(0);
      expect(b.position).toBeGreaterThanOrEqual(a.position);
    }
    // Spot checks against the GW1–6 results: Man City won all six, Arsenal
    // lost only away at Brighton (3–0, GW5). Brentford and Everton are level on
    // 10 points, but Brentford's +6 goal difference beats Everton's +3.
    expect(rows[0]).toMatchObject({ position: 1, played: 6, won: 6, points: 18, goalsFor: 16, goalsAgainst: 5 });
    expect(rows[0].club.name).toBe("Man City");
    expect(rows[1]).toMatchObject({ position: 2, won: 5, lost: 1, points: 15, form: ["W", "W", "W", "L", "W"] });
    expect(rows[1].club.name).toBe("Arsenal");
    const bre = rows.find((r) => r.club.shortName === "BRE")!;
    const eve = rows.find((r) => r.club.shortName === "EVE")!;
    expect([bre.points, eve.points]).toEqual([10, 10]);
    expect(bre.position).toBeLessThan(eve.position);
  });

  it("shows a pre-season table with nobody ranked above anybody", () => {
    const preseason = clone(snapshot);
    for (const f of preseason.fixtures) {
      Object.assign(f, { started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null });
    }
    const table = buildLeagueTable(preseason);
    expect(table.results).toBe(0);
    expect(table.rows.every((r) => r.played === 0 && r.position === 1 && r.shared)).toBe(true);
    // Alphabetical, as the Premier League lists clubs level on everything.
    expect(table.rows.map((r) => r.club.name)).toEqual([...table.rows.map((r) => r.club.name)].sort((a, b) => a.localeCompare(b, "en-GB")));
  });

  it("counts provisional results and leaves matches in progress out", () => {
    const live = clone(snapshot);
    const [a, b] = live.fixtures.filter((f) => f.event === 6);
    a.finished = false; // full time, unconfirmed: counted
    Object.assign(b, { finished: false, finished_provisional: false, minutes: 55 }); // in progress: not counted
    const table = buildLeagueTable(live);
    expect(table.results).toBe(59);
    expect(table.provisional).toBe(1);
    expect(table.inProgress).toBe(1);
    const playing = table.rows.find((r) => r.club.id === b.team_h)!;
    expect(playing.played).toBe(5);
    expect(playing.xgc).toEqual({ available: false, reason: "match-in-progress" });
  });
});

describe("tie-breakers", () => {
  const teams = [team(1, "Alpha"), team(2, "Bravo"), team(3, "Charlie"), team(4, "Delta")];

  it("during the season, clubs level on points, GD and goals share a position, listed alphabetically", () => {
    // Bravo and Alpha both beat Delta 2–0 and lost to Charlie 1–0... level on everything.
    const fixtures = [result(2, 4, 2, 0), result(1, 4, 2, 0), result(3, 2, 1, 0), result(3, 1, 1, 0)];
    const { rows, seasonComplete } = buildLeagueTable(tinySnapshot(teams, fixtures));
    expect(seasonComplete).toBe(false);
    expect(rows.map((r) => [r.club.name, r.position, r.shared])).toEqual([
      ["Charlie", 1, false],
      ["Alpha", 2, true],
      ["Bravo", 2, true],
      ["Delta", 4, false],
    ]);
    expect(positionLabel(rows[1])).toBe("joint 2nd");
    expect(positionLabel(rows[0])).toBe("1st");
  });

  // A complete double round-robin of three clubs (each plays the others twice).
  const three = [team(1, "Alpha"), team(2, "Bravo"), team(3, "Charlie")];

  it("once the season is complete, separates level clubs on head-to-head points", () => {
    // Alpha and Bravo both end on 7 points, 4 scored, 2 conceded. Bravo took 4
    // points from their two games (1–1, then 1–0 at home), so Bravo is higher.
    const fixtures = [
      result(1, 2, 1, 1), result(2, 1, 1, 0),
      result(1, 3, 2, 0), result(3, 1, 0, 1),
      result(2, 3, 2, 0), result(3, 2, 1, 0),
    ];
    const { rows, seasonComplete } = buildLeagueTable(tinySnapshot(three, fixtures));
    expect(seasonComplete).toBe(true);
    const alpha = rows.find((r) => r.club.id === 1)!;
    const bravo = rows.find((r) => r.club.id === 2)!;
    expect([alpha.points, alpha.goalsFor, alpha.goalsAgainst]).toEqual([7, 4, 2]);
    expect([bravo.points, bravo.goalsFor, bravo.goalsAgainst]).toEqual([7, 4, 2]);
    expect(rows.map((r) => [r.club.name, r.position, r.shared])).toEqual([
      ["Bravo", 1, false],
      ["Alpha", 2, false],
      ["Charlie", 3, false],
    ]);
  });

  it("then on away goals in the games between them, then shares the position (a play-off can't be computed)", () => {
    // Both beat Charlie twice 1–0. Alpha v Bravo 2–2 and Bravo v Alpha 1–1:
    // 2 head-to-head points each, but Bravo scored 2 away goals to Alpha's 1.
    const base = (ab: [number, number], ba: [number, number]) => [
      result(1, 2, ...ab), result(2, 1, ...ba),
      result(1, 3, 1, 0), result(3, 1, 0, 1),
      result(2, 3, 1, 0), result(3, 2, 0, 1),
    ];
    let table = buildLeagueTable(tinySnapshot(three, base([2, 2], [1, 1])));
    expect(table.rows.map((r) => [r.club.name, r.position, r.shared])).toEqual([
      ["Bravo", 1, false],
      ["Alpha", 2, false],
      ["Charlie", 3, false],
    ]);

    // 1–1 both ways: level on everything the rules let us compute.
    table = buildLeagueTable(tinySnapshot(three, base([1, 1], [1, 1])));
    expect(table.rows.map((r) => [r.club.name, r.position, r.shared])).toEqual([
      ["Alpha", 1, true],
      ["Bravo", 1, true],
      ["Charlie", 3, false],
    ]);
  });
});

// ─── xGC ────────────────────────────────────────────────────────────────────

describe("teamXgc", () => {
  const gk = (team: number, goals_conceded: number, xgc: string) =>
    ({ team, element_type: 1, goals_conceded, expected_goals_conceded: xgc }) as Pick<
      Element,
      "team" | "element_type" | "goals_conceded" | "expected_goals_conceded"
    >;
  const outfield = { team: 1, element_type: 2, goals_conceded: 9, expected_goals_conceded: "9.90" };

  it("adds up the club's goalkeepers when their goals conceded match the results", () => {
    const elements = [gk(1, 4, "5.10"), gk(1, 1, "0.83"), gk(2, 7, "3.00"), outfield];
    expect(teamXgc(elements, 1, 5, false)).toEqual({ available: true, value: 5.93 });
  });

  it("is unavailable when the keepers don't account for every goal, or mid-match", () => {
    const elements = [gk(1, 4, "5.10")];
    expect(teamXgc(elements, 1, 5, false)).toEqual({ available: false, reason: "keepers-mismatch" });
    expect(teamXgc(elements, 1, 4, true)).toEqual({ available: false, reason: "match-in-progress" });
    expect(teamXgc([], 1, 0, false)).toEqual({ available: true, value: 0 });
  });

  it("rests on a fact the recorded gameweeks bear out: the keepers' goals conceded are the club's", () => {
    // test/fixtures/gameweeks/: GW1–10 of 2026/27, 200 team-matches. Each
    // player's club is their club at recording time, which held for every keeper.
    const identities = JSON.parse(
      readFileSync(path.join(__dirname, "fixtures", "gameweeks", "bootstrap-static.json"), "utf8"),
    ) as { elements: { id: number; team: number; element_type: number }[] };
    const keepers = new Map(identities.elements.filter((e) => e.element_type === 1).map((e) => [e.id, e.team]));
    let checked = 0;
    for (let gw = 1; gw <= 10; gw++) {
      const { fixtures, live } = loadRecordedGameweek(gw);
      const conceded = new Map<number, number>();
      for (const p of live.elements) {
        const club = keepers.get(p.id);
        if (club !== undefined) conceded.set(club, (conceded.get(club) ?? 0) + p.stats.goals_conceded);
      }
      for (const f of fixtures) {
        expect(conceded.get(f.team_h) ?? 0).toBe(f.team_a_score);
        expect(conceded.get(f.team_a) ?? 0).toBe(f.team_h_score);
        checked += 2;
      }
    }
    expect(checked).toBe(200);
  });
});

// ─── Club page ──────────────────────────────────────────────────────────────

describe("buildClubPage", () => {
  it("returns null for an unknown slug", () => {
    expect(buildClubPage(snapshot, "real-madrid")).toBeNull();
  });

  it("lists results newest first, with a home and away split that adds up", () => {
    const page = buildClubPage(snapshot, "arsenal")!;
    expect(page.club).toMatchObject({ id: 1, fullName: "Arsenal", path: "/teams/arsenal/" });
    expect(page.row).toMatchObject({ position: 2, points: 15 });
    expect(page.clubs).toBe(20);
    expect(page.results).toHaveLength(6);
    expect(page.results[0]).toMatchObject({ gameweek: 6, home: true, goalsFor: 2, goalsAgainst: 1, outcome: "W" });
    expect(page.results[0].opponent).toMatchObject({ name: "Leeds", path: "/teams/leeds-united/" });
    expect(describeResult(page.results[1])).toBe("Lost 0–3 away at Brighton");
    expect(page.home.played + page.away.played).toBe(page.row.played);
    expect(page.home.points + page.away.points).toBe(page.row.points);
    expect(page.home.cleanSheets + page.away.cleanSheets).toBe(page.row.cleanSheets);
    // Every recorded fixture is played, so nothing is left to show.
    expect(page.upcoming).toEqual([]);
    expect(page.nextWeeks).toEqual([]);
    expect(page.nextWeeksDifficulty).toBeNull();
  });

  it("lists the top players by points, without players who've left", () => {
    const page = buildClubPage(snapshot, "arsenal")!;
    const points = page.topPlayers.map((p) => p.totalPoints);
    expect(page.topPlayers.length).toBeLessThanOrEqual(TOP_PLAYERS_LENGTH);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(page.topPlayers[0]).toMatchObject({ id: 4, name: "Gabriel", position: "DEF", totalPoints: 66, price: 8.1 });

    const gone = clone(snapshot);
    gone.bootstrap.elements.find((e) => e.id === 4)!.status = "u";
    expect(buildClubPage(gone, "arsenal")!.topPlayers.map((p) => p.id)).not.toContain(4);
  });

  it("builds upcoming fixtures and a strip with blanks and doubles", () => {
    const future = clone(snapshot);
    const unplay = (f: Fixture) =>
      Object.assign(f, { started: false, finished: false, finished_provisional: false, minutes: 0, team_h_score: null, team_a_score: null, stats: [] });
    // Arsenal (1): GW4 and GW6 fixtures unplayed, GW5's moved into GW6 (a
    // double), so GW5 is a blank, plus one postponed fixture with no date.
    const ars = future.fixtures.filter((f) => f.team_h === 1 || f.team_a === 1);
    const [gw4, gw5, gw6] = [4, 5, 6].map((gw) => ars.find((f) => f.event === gw)!);
    [gw4, gw5, gw6].forEach(unplay);
    gw5.event = 6;
    const postponed = unplay(ars.find((f) => f.event === 3)!);
    Object.assign(postponed, { event: null, kickoff_time: null });

    const page = buildClubPage(future, "arsenal")!;
    expect(page.row.played).toBe(2);
    expect(page.upcoming.map((f) => f.gameweek)).toEqual([4, 6, 6, null]);
    expect(page.upcoming[0]).toMatchObject({
      home: gw4.team_h === 1,
      difficulty: gw4.team_h === 1 ? gw4.team_h_difficulty : gw4.team_a_difficulty,
    });
    // The recorded bootstrap has gameweeks 1–6, so the strip stops at GW6.
    expect(page.nextWeeks.map((w) => [w.gameweek, w.fixtures.length])).toEqual([
      [4, 1],
      [5, 0],
      [6, 2],
    ]);
    const difficulties = page.upcoming.slice(0, 3).map((f) => f.difficulty);
    expect(page.nextWeeksDifficulty).toBeCloseTo(difficulties.reduce((a, b) => a + b, 0) / 3, 2);
    expect(averageFixtureDifficulty([{ gameweek: 1, fixtures: [] }])).toBeNull();
    expect(clubDescription(page)).toMatch(/^Arsenal are (joint )?\d+(st|nd|rd|th) in the Premier League with 6 points from 2 games \(W2 D0 L0\)\. Next: .+ \([HA]\) in GW4\./);
  });

  it("shows matches in progress separately, without counting them", () => {
    const live = clone(snapshot);
    const f = live.fixtures.find((x) => x.event === 6 && (x.team_h === 1 || x.team_a === 1))!;
    Object.assign(f, { finished: false, finished_provisional: false, minutes: 70 });
    const page = buildClubPage(live, "arsenal")!;
    expect(page.results).toHaveLength(5);
    expect(page.inProgress).toEqual([
      expect.objectContaining({ fixtureId: f.id, gameweek: 6, goalsFor: 2, goalsAgainst: 1 }),
    ]);
    expect(page.upcoming).toEqual([]);
  });
});

// ─── Text ───────────────────────────────────────────────────────────────────

describe("text helpers", () => {
  it("formats dates in UK time", () => {
    expect(formatMatchDate("2026-08-22T23:30:00Z")).toBe("Sun 23 Aug"); // 00:30 BST
    expect(formatMatchDate(null)).toBe("TBC");
  });

  it("writes ordinals and form for screen readers", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd",
    ]);
    expect(describeForm(["W", "D", "L"])).toBe("Last 3, oldest first: won, drew, lost");
    expect(describeForm([])).toBe("No results yet");
  });

  it("describes a club with no results yet", () => {
    const preseason = clone(snapshot);
    for (const f of preseason.fixtures) {
      Object.assign(f, { started: false, finished: false, finished_provisional: false, team_h_score: null, team_a_score: null });
    }
    const page = buildClubPage(preseason, "manchester-city")!;
    expect(page.results).toEqual([]);
    expect(page.upcoming).toHaveLength(6);
    expect(clubDescription(page)).toMatch(/^Manchester City in Fantasy Premier League: no results yet this season\. Next: .+ in GW1\./);
  });
});

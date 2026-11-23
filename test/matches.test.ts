import { beforeAll, describe, expect, it } from "vitest";
import { matchStat, type Fixture, type Snapshot } from "../src/lib/fpl";
import {
  buildFormation,
  buildGameweekPage,
  buildGameweekSummaries,
  buildMatch,
  buildMatchList,
  buildMatchPage,
  buildSchedulePlanner,
  firstDeadline,
  gameweekMetadata,
  gameweekState,
  hasMatchPage,
  hasStarted,
  matchMetadata,
  matchPageIds,
  matchState,
  matchTitle,
  provisionalBonus,
  seasonLabel,
  seasonScores,
  startedGameweeks,
} from "../src/lib/stats/matches";
import { buildFixtureSnapshot } from "./fixture-client";

// The CI fixture snapshot: GW1–6 with 60 fixtures, all kicked off and with
// match stats; GW1–2 settled (teams of the week), GW3 current, GW4 next. The
// recordings are from different days, so GW4–6 already have results.
let snapshot: Snapshot;
beforeAll(async () => {
  snapshot = (await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"))).snapshot;
});

const fixture = (id: number) => snapshot.fixtures.find((f) => f.id === id)!;

/** A copy of the snapshot with every fixture from `fromGameweek` on not yet played. */
function beforeGameweek(fromGameweek: number): Snapshot {
  const copy = structuredClone(snapshot);
  for (const f of copy.fixtures) {
    if (f.event !== null && f.event >= fromGameweek) {
      Object.assign(f, {
        started: false,
        finished: false,
        finished_provisional: false,
        minutes: 0,
        team_h_score: null,
        team_a_score: null,
        stats: [],
      });
    }
  }
  for (const e of copy.bootstrap.events) {
    if (e.id >= fromGameweek) Object.assign(e, { finished: false, data_checked: false, is_current: false, is_previous: false });
    if (e.id === fromGameweek - 1) Object.assign(e, { is_current: true });
  }
  return copy;
}

/** Empties one stat of a fixture (as before FPL adds bonus). */
function withoutStat(f: Fixture, identifier: string): Fixture {
  return { ...f, stats: f.stats.map((s) => (s.identifier === identifier ? { ...s, h: [], a: [] } : s)) };
}

describe("gameweek and match state", () => {
  const event = { id: 5, finished: false, data_checked: false, is_current: false, is_previous: false };

  it("counts a gameweek as started from FPL's flags or a kicked-off match", () => {
    expect(hasStarted(event, [])).toBe(false);
    expect(hasStarted({ ...event, is_current: true }, [])).toBe(true);
    expect(hasStarted({ ...event, is_previous: true }, [])).toBe(true);
    expect(hasStarted({ ...event, finished: true }, [])).toBe(true);
    expect(hasStarted(event, [{ event: 5, started: false }, { event: 6, started: true }])).toBe(false);
    expect(hasStarted(event, [{ event: 5, started: true }])).toBe(true);
  });

  it("names a gameweek's state", () => {
    expect(gameweekState(event, [])).toBe("upcoming");
    expect(gameweekState({ ...event, is_current: true }, [])).toBe("in-progress");
    expect(gameweekState({ ...event, finished: true }, [])).toBe("finished");
    expect(gameweekState({ ...event, finished: true, data_checked: true }, [])).toBe("settled");
  });

  it("names a match's state, and gives a page to matches that have kicked off", () => {
    const base = { event: 3, started: false, finished: false, finished_provisional: false };
    expect(matchState(base)).toBe("upcoming");
    expect(matchState({ ...base, event: null })).toBe("postponed");
    expect(matchState({ ...base, started: true })).toBe("live");
    expect(matchState({ ...base, started: true, finished_provisional: true })).toBe("provisional");
    expect(matchState({ ...base, started: true, finished_provisional: true, finished: true })).toBe("finished");
    expect(hasMatchPage(base)).toBe(false);
    expect(hasMatchPage({ ...base, event: null })).toBe(false);
    expect(hasMatchPage({ ...base, started: true })).toBe(true);
  });

  it("lists started gameweeks and match pages from the snapshot", () => {
    expect(startedGameweeks(snapshot.bootstrap.events, snapshot.fixtures)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(matchPageIds(snapshot)).toHaveLength(60);
    const early = beforeGameweek(4);
    expect(startedGameweeks(early.bootstrap.events, early.fixtures)).toEqual([1, 2, 3]);
    expect(matchPageIds(early)).toHaveLength(30);
  });
});

describe("gameweek dashboard", () => {
  it("summarises every started gameweek, newest first, from FPL's events", () => {
    const summaries = buildGameweekSummaries(snapshot);
    expect(summaries.map((s) => s.gameweek)).toEqual([6, 5, 4, 3, 2, 1]);
    const gw2 = summaries.find((s) => s.gameweek === 2)!;
    expect(gw2).toMatchObject({
      state: "settled",
      averageScore: 81,
      highestScore: 161,
      transfersMade: 11562127,
      topScorer: { id: 426, points: 23 },
      mostCaptained: { id: 411, path: "/players/411/" },
      mostViceCaptained: { id: 1 },
      mostSelected: { id: 165 },
      mostTransferredIn: { id: 115 },
      matches: { played: 10, total: 10 },
    });
    // Most played first, in words.
    expect(gw2.chips.map((c) => c.label)).toEqual(["Bench Boost", "Wildcard", "Triple Captain", "Free Hit"]);
    expect(summaries.find((s) => s.gameweek === 3)!.state).toBe("in-progress");
  });

  it("has no transfer facts for gameweek 1, though FPL fills most_transferred_in in", () => {
    const gw1 = buildGameweekSummaries(snapshot).find((s) => s.gameweek === 1)!;
    expect(snapshot.bootstrap.events[0].most_transferred_in).not.toBeNull();
    expect(gw1.mostTransferredIn).toBeNull();
    expect(gw1.transfersMade).toBeNull();
  });

  it("leaves out scores before any points are in, and names nobody FPL no longer lists", () => {
    const copy = structuredClone(snapshot);
    Object.assign(copy.bootstrap.events[1], { average_entry_score: 0, highest_score: null, most_captained: 99999, most_selected: undefined });
    const gw2 = buildGameweekSummaries(copy).find((s) => s.gameweek === 2)!;
    expect(gw2.averageScore).toBeNull();
    expect(gw2.highestScore).toBeNull();
    expect(gw2.mostCaptained).toBeNull();
    expect(gw2.mostSelected).toBeNull();
    expect(seasonScores([gw2])).toEqual([]);
  });

  it("charts average and highest score oldest first", () => {
    const chart = seasonScores(buildGameweekSummaries(snapshot));
    expect(chart.map((p) => p.gameweek)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chart[0]).toEqual({ gameweek: 1, average: 50, highest: 131 });
  });

  it("is empty before the season, with the first deadline to show instead", () => {
    const preseason = beforeGameweek(1);
    expect(buildGameweekSummaries(preseason)).toEqual([]);
    expect(firstDeadline(preseason)).toBe("Fri 21 Aug, 18:30 UK time");
  });
});

describe("gameweek page", () => {
  it("lays the team of the week out as a formation, goalkeeper first", () => {
    const team = buildFormation(snapshot, 1)!;
    expect(team.formation).toBe("4-5-1");
    expect(team.lines.map((l) => l.line)).toEqual(["GKP", "DEF", "MID", "FWD"]);
    expect(team.lines[0].players.map((p) => p.id)).toEqual([572]);
    expect(team.lines.flatMap((l) => l.players)).toHaveLength(11);
    expect(team.totalPoints).toBe(148);
    const top = team.lines.flatMap((l) => l.players).filter((p) => p.top);
    expect(top).toMatchObject([{ id: 115, points: 17 }]);
  });

  it("has no team of the week until the gameweek is settled", () => {
    expect(buildFormation(snapshot, 3)).toBeNull();
    expect(buildGameweekPage(snapshot, 3)!.teamOfTheWeek).toBeNull();
  });

  it("keeps a player FPL no longer lists, rather than drop their points", () => {
    const copy = structuredClone(snapshot);
    copy.bootstrap.elements = copy.bootstrap.elements.filter((e) => e.id !== 165);
    const team = buildFormation(copy, 1)!;
    expect(team.lines.flatMap((l) => l.players)).toHaveLength(11);
    expect(team.lines.at(-1)!.players.map((p) => p.name)).toContain("Player 165");
  });

  it("lists results in kickoff order, linking those that have kicked off", () => {
    const results = buildMatchList(snapshot, 1);
    expect(results).toHaveLength(10);
    expect(results[0]).toMatchObject({ id: 1, homeScore: 3, awayScore: 0, state: "finished", path: "/matches/1/" });
    expect(results[0].home.short).toBe("ARS");
    const upcoming = buildMatchList(beforeGameweek(4), 4);
    expect(upcoming.every((m) => m.path === null && m.state === "upcoming" && m.homeScore === null)).toBe(true);
  });

  it("links to the neighbouring started gameweeks, and has no page for one that hasn't started", () => {
    expect(buildGameweekPage(snapshot, 1)).toMatchObject({ previous: null, next: 2 });
    expect(buildGameweekPage(snapshot, 6)).toMatchObject({ previous: 5, next: null });
    const early = beforeGameweek(4);
    expect(buildGameweekPage(early, 3)).toMatchObject({ previous: 2, next: null });
    expect(buildGameweekPage(early, 4)).toBeNull();
    expect(buildGameweekPage(snapshot, 99)).toBeNull();
  });
});

describe("provisional bonus", () => {
  const rows = (...values: number[]) => values.map((value, i) => ({ element: i + 1, value }));

  it("gives 3, 2 and 1 to the top three BPS", () => {
    expect(provisionalBonus(rows(10, 30, 20, 5))).toEqual(new Map([[2, 3], [3, 2], [1, 1]]));
  });

  it("shares places on ties, as FPL does", () => {
    // Tie for first: both get 3, the next gets 1.
    expect(provisionalBonus(rows(30, 30, 20, 10))).toEqual(new Map([[1, 3], [2, 3], [3, 1]]));
    // Tie for second: 3, then 2 each, and nobody gets 1.
    expect(provisionalBonus(rows(30, 20, 20, 10))).toEqual(new Map([[1, 3], [2, 2], [3, 2]]));
    // Tie for third: 3, 2, then 1 each.
    expect(provisionalBonus(rows(30, 20, 10, 10, 5))).toEqual(new Map([[1, 3], [2, 2], [3, 1], [4, 1]]));
    // Three-way tie for first.
    expect(provisionalBonus(rows(30, 30, 30, 10))).toEqual(new Map([[1, 3], [2, 3], [3, 3]]));
  });

  it("matches the bonus FPL awarded in every recorded match", () => {
    for (const f of snapshot.fixtures.filter((x) => x.finished)) {
      const { home, away } = matchStat(f, "bonus");
      const awarded = new Map([...home, ...away].map((r) => [r.element, r.value]));
      const bps = [...matchStat(f, "bps").home, ...matchStat(f, "bps").away];
      expect(provisionalBonus(bps), `fixture ${f.id}`).toEqual(awarded);
    }
  });
});

describe("match page", () => {
  it("gives the score and each side's goals, assists, cards and bonus", () => {
    const match = buildMatchPage(snapshot, 1)!;
    expect(matchTitle(match)).toBe("Arsenal 3–0 Coventry City");
    expect(match).toMatchObject({ gameweek: 1, state: "finished", bonusSource: "fpl", kickoff: "Fri 21 Aug, 20:00 UK time" });
    expect(match.home.goals.map((g) => g.id).sort((a, b) => a - b)).toEqual([12, 15, 26]);
    expect(match.away.goals).toEqual([]);
    expect(match.home.bonus.map((b) => [b.id, b.value])).toEqual([[15, 3], [10, 2], [12, 1]]);
    expect(match.away.saves).toEqual([{ id: 110, name: expect.any(String), value: 2 }]);
  });

  it("counts an own goal for the other side, and still lists it under the scorer's side", () => {
    // Fixture 16 ends 4–3: player 165 (home) scored at both ends.
    const match = buildMatchPage(snapshot, 16)!;
    expect([match.home.score, match.away.score]).toEqual([4, 3]);
    expect(match.home.goals.filter((g) => !g.ownGoal)).toHaveLength(4);
    expect(match.away.goals.find((g) => g.ownGoal)).toMatchObject({ id: 165 });
    expect(match.home.ownGoals.map((p) => p.id)).toEqual([165]);
    for (const side of [match.home, match.away]) {
      expect(side.goals.reduce((n, g) => n + g.value, 0)).toBe(side.score);
    }
  });

  it("ranks every player by BPS with shared ranks, and keeps those with only defensive contributions", () => {
    const match = buildMatchPage(snapshot, 1)!;
    expect(match.players[0]).toMatchObject({ id: 15, bps: 41, rank: 1, bonus: 3, defensiveContribution: 8, side: "home" });
    const ranks = match.players.map((p) => p.rank);
    for (let i = 1; i < match.players.length; i++) {
      const [a, b] = [match.players[i - 1], match.players[i]];
      expect(a.bps).toBeGreaterThanOrEqual(b.bps);
      expect(ranks[i]).toBe(a.bps === b.bps ? ranks[i - 1] : i + 1);
    }
    // Fixture 8: players 60 and 61 have defensive contributions but 0 BPS.
    const eight = buildMatchPage(snapshot, 8)!;
    const zero = eight.players.filter((p) => p.id === 60 || p.id === 61);
    expect(zero).toHaveLength(2);
    expect(zero.every((p) => p.bps === 0 && p.defensiveContribution > 0)).toBe(true);
  });

  it("works bonus out from BPS until FPL adds it, and says so", () => {
    const f = withoutStat(fixture(6), "bonus");
    const provisional = buildMatch(snapshot, { ...f, finished: false });
    expect(provisional.state).toBe("provisional");
    expect(provisional.bonusSource).toBe("provisional");
    // The same bonus FPL later awarded (a tie for second).
    expect(provisional.away.bonus.map((b) => [b.id, b.value])).toEqual(
      buildMatchPage(snapshot, 6)!.away.bonus.map((b) => [b.id, b.value]),
    );
    const live = buildMatch(snapshot, { ...f, finished: false, finished_provisional: false, minutes: 63 });
    expect(live).toMatchObject({ state: "live", minutes: 63, bonusSource: "provisional" });
    // A finished match with no bonus listed isn't guessed at.
    expect(buildMatch(snapshot, f).bonusSource).toBe("none");
    // Nor is one with no BPS yet.
    expect(buildMatch(snapshot, { ...f, finished: false, stats: [] }).bonusSource).toBe("none");
  });

  it("has no page for an unknown fixture or one that hasn't kicked off", () => {
    expect(buildMatchPage(snapshot, 9999)).toBeNull();
    expect(buildMatchPage(beforeGameweek(4), 31)).toBeNull();
  });
});

describe("double and blank planner", () => {
  it("covers the gameweeks that haven't started", () => {
    expect(buildSchedulePlanner(snapshot).gameweeks).toEqual([]);
    const planner = buildSchedulePlanner(beforeGameweek(4));
    expect(planner.gameweeks).toEqual([4, 5, 6]);
    expect(planner.hasDoublesOrBlanks).toBe(false);
    expect(planner.weeks.map((w) => w.matches)).toEqual([10, 10, 10]);
    expect(planner.rows).toHaveLength(20);
    expect(planner.rows.every((r) => r.total === 3 && r.doubles === 0 && r.blanks === 0)).toBe(true);
    expect(planner.rows.map((r) => r.team.short)).toEqual([...planner.rows.map((r) => r.team.short)].sort());
  });

  it("finds doubles, blanks and postponed matches", () => {
    const copy = beforeGameweek(4);
    const gw5 = copy.fixtures.filter((f) => f.event === 5);
    const moved = gw5[0];
    const postponed = gw5[1];
    moved.event = 6;
    postponed.event = null;
    postponed.kickoff_time = null;

    const planner = buildSchedulePlanner(copy);
    expect(planner.hasDoublesOrBlanks).toBe(true);
    const [w4, w5, w6] = planner.weeks;
    expect(w4.doubles).toEqual([]);
    expect(w4.blanks).toEqual([]);
    expect(w5.matches).toBe(8);
    expect(w5.blanks.map((t) => t.id).sort((a, b) => a - b)).toEqual(
      [moved.team_h, moved.team_a, postponed.team_h, postponed.team_a].sort((a, b) => a - b),
    );
    expect(w6.matches).toBe(11);
    expect(w6.doubles.map((d) => d.team.id).sort((a, b) => a - b)).toEqual([moved.team_h, moved.team_a].sort((a, b) => a - b));
    expect(w6.doubles[0].fixtures).toHaveLength(2);
    expect(planner.postponed).toMatchObject([{ id: postponed.id, home: { id: postponed.team_h }, away: { id: postponed.team_a } }]);

    const row = planner.rows.find((r) => r.team.id === moved.team_h)!;
    expect(row.weeks.map((w) => w.length)).toEqual([1, 0, 2]);
    expect(row).toMatchObject({ total: 3, doubles: 1, blanks: 1 });
    const postponedRow = planner.rows.find((r) => r.team.id === postponed.team_h)!;
    expect(postponedRow).toMatchObject({ total: 2, doubles: 0, blanks: 1 });
  });

  it("plans the whole season before it starts", () => {
    const planner = buildSchedulePlanner(beforeGameweek(1));
    expect(planner.gameweeks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(planner.weeks[0].deadline).toBe("Fri 21 Aug, 18:30 UK time");
  });
});

describe("metadata", () => {
  it("titles and describes a match page, flagging one that isn't final", () => {
    const season = seasonLabel(snapshot);
    expect(season).toBe("2026/27");
    const match = buildMatchPage(snapshot, 1)!;
    const meta = matchMetadata(match, season);
    expect(meta.title).toBe("Arsenal 3–0 Coventry City (GW1, 2026/27): FPL match stats");
    expect(meta.alternates).toEqual({ canonical: "/matches/1/" });
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    const live = buildMatch(snapshot, { ...fixture(1), finished: false, finished_provisional: false });
    expect(matchMetadata(live, season).title).toBe("Arsenal 3–0 Coventry City (GW1, 2026/27, in progress): FPL match stats");
  });

  it("describes a gameweek from its numbers", () => {
    const meta = gameweekMetadata(buildGameweekPage(snapshot, 2)!.summary, "2026/27");
    expect(meta.title).toBe("FPL Gameweek 2 stats, results and team of the week");
    expect(meta.alternates).toEqual({ canonical: "/gameweeks/2/" });
    expect(String(meta.description)).toMatch(/^FPL 2026\/27 Gameweek 2 stats: average 81, highest 161/);
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
  });
});

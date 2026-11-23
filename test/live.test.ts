import { beforeAll, describe, expect, it } from "vitest";
import { matchStatRows, SCHEDULES, type Fixture, type Snapshot } from "../src/lib/fpl";
import {
  bonusAdded,
  bonusCheck,
  buildLivePage,
  dayPointsLabel,
  formatDayKey,
  matchBonus,
  matchState,
  pendingBonus,
  provisionalBonus,
  refreshCadence,
} from "../src/lib/stats/live";
import { buildFixtureSnapshot, loadRecordedGameweek } from "./fixture-client";

/** A fixture whose only stat is BPS, from [player, bps] pairs (home side). */
function bpsFixture(scores: [number, number][], extra: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    code: 1,
    event: 1,
    kickoff_time: "2026-09-05T14:00:00Z",
    provisional_start_time: false,
    started: true,
    finished_provisional: false,
    finished: false,
    minutes: 60,
    team_h: 1,
    team_a: 2,
    team_h_score: 0,
    team_a_score: 0,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    stats: [
      { identifier: "bonus", h: [], a: [] },
      { identifier: "bps", h: scores.map(([element, value]) => ({ element, value })), a: [] },
    ],
    ...extra,
  } as Fixture;
}

const bonusOf = (f: Fixture) => provisionalBonus(f).map((a) => [a.element, a.bonus]);

describe("provisional bonus", () => {
  it("gives 3, 2 and 1 to the top three BPS", () => {
    expect(bonusOf(bpsFixture([[1, 20], [2, 40], [3, 30], [4, 10]]))).toEqual([[2, 3], [3, 2], [1, 1]]);
  });

  it("shares the higher award on a tie and skips the next place", () => {
    // Tie for first: 3, 3, then 1.
    expect(bonusOf(bpsFixture([[1, 40], [2, 40], [3, 30], [4, 20]]))).toEqual([[1, 3], [2, 3], [3, 1]]);
    // Tie for second: 3, 2, 2, nobody else.
    expect(bonusOf(bpsFixture([[1, 40], [2, 30], [3, 30], [4, 20]]))).toEqual([[1, 3], [2, 2], [3, 2]]);
    // Tie for third: 3, 2, 1, 1.
    expect(bonusOf(bpsFixture([[1, 40], [2, 30], [3, 20], [4, 20], [5, 10]]))).toEqual([[1, 3], [2, 2], [3, 1], [4, 1]]);
    // Three tied for first: 3 each, nobody else.
    expect(bonusOf(bpsFixture([[1, 40], [2, 40], [3, 40], [4, 30]]))).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("ranks only positive BPS, across both sides", () => {
    expect(bonusOf(bpsFixture([[1, 5], [2, -3]]))).toEqual([[1, 3]]);
    expect(bonusOf(bpsFixture([]))).toEqual([]);
    const f = bpsFixture([[1, 10]]);
    f.stats[1].a = [{ element: 9, value: 12 }];
    expect(provisionalBonus(f)).toEqual([
      { element: 9, side: "away", bps: 12, bonus: 3 },
      { element: 1, side: "home", bps: 10, bonus: 2 },
    ]);
  });

  it("equals FPL's bonus in every confirmed match of GW1–10", () => {
    let matches = 0;
    let ties = 0;
    for (let gw = 1; gw <= 10; gw++) {
      for (const fixture of loadRecordedGameweek(gw).fixtures) {
        if (!fixture.finished) continue;
        matches++;
        const fpl = matchStatRows(fixture, "bonus").map((r) => [r.element, r.value]).sort((a, b) => a[0] - b[0]);
        const ours = bonusOf(fixture).sort((a, b) => a[0] - b[0]);
        expect(ours, `GW${gw} fixture ${fixture.id}`).toEqual(fpl);
        if (fpl.length !== 3) ties++;
      }
      expect(bonusCheck(loadRecordedGameweek(gw).fixtures)).toEqual({ matches: 10, agree: 10 });
    }
    expect(matches).toBe(100);
    expect(ties).toBeGreaterThan(0); // the recording has tied BPS, so the tie rule is exercised
  });
});

describe("match state and bonus source", () => {
  it("reads the state from FPL's flags", () => {
    const flags = (started: boolean, finished_provisional: boolean, finished: boolean) =>
      matchState({ started, finished_provisional, finished });
    expect(flags(false, false, false)).toBe("upcoming");
    expect(flags(true, false, false)).toBe("live");
    expect(flags(true, true, false)).toBe("finished");
    expect(flags(true, true, true)).toBe("confirmed");
  });

  it("uses FPL's bonus once added, provisional bonus before, nothing before kickoff", () => {
    const live = bpsFixture([[1, 40], [2, 30], [3, 20]]);
    expect(bonusAdded(live)).toBe(false);
    expect(matchBonus(live).source).toBe("provisional");
    expect(matchBonus(live).awards.map((a) => a.bonus)).toEqual([3, 2, 1]);

    const added = bpsFixture([[1, 40], [2, 30], [3, 20]], { finished_provisional: true });
    added.stats[0].h = [{ element: 2, value: 3 }];
    expect(bonusAdded(added)).toBe(true);
    expect(matchBonus(added)).toEqual({ source: "fpl", awards: [{ element: 2, side: "home", bps: 30, bonus: 3 }] });

    expect(bonusAdded(bpsFixture([], { finished: true }))).toBe(true);
    expect(matchBonus(bpsFixture([], { started: false }))).toEqual({ source: "none", awards: [] });
  });

  it("adds up pending bonus per player, only for matches without FPL's bonus", () => {
    const a = bpsFixture([[1, 40], [2, 30], [3, 20]]);
    const b = { ...bpsFixture([[1, 50], [4, 10]]), id: 2 };
    const done = { ...bpsFixture([[5, 50]], { finished: true }), id: 3 };
    expect(pendingBonus([a, b, done])).toEqual(new Map([[1, 6], [2, 2], [3, 1], [4, 2]]));
  });
});

describe("refresh cadence", () => {
  it("reads the workflow's schedules", () => {
    expect(refreshCadence(SCHEDULES)).toEqual({ matchDayMinutes: 30, otherDayHours: 2 });
    expect(refreshCadence({ "0,15,30,45 * * * *": "match-day", "0 */3 * * *": "two-hourly" })).toEqual({
      matchDayMinutes: 15,
      otherDayHours: 3,
    });
  });
});

describe("labels", () => {
  it("formats days and event-status flags", () => {
    expect(formatDayKey("2026-09-05")).toBe("Saturday 5 September");
    expect(dayPointsLabel("p")).toBe("Points provisional");
    expect(dayPointsLabel("r")).toBe("Points confirmed");
    expect(dayPointsLabel("")).toBe("Not started");
  });
});

describe("the live page", () => {
  // The CI fixture snapshot: GW3 is current, its 10 matches all confirmed.
  let snapshot: Snapshot;
  beforeAll(async () => {
    snapshot = (await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"))).snapshot;
  });

  it("is null without a current gameweek", () => {
    expect(buildLivePage({ ...snapshot, live: null })).toBeNull();
  });

  it("builds matches by day, with FPL's bonus for confirmed matches", () => {
    const page = buildLivePage(snapshot)!;
    expect(page.gameweek).toBe(3);
    expect(page.matches).toHaveLength(10);
    expect(page.counts).toEqual({ upcoming: 0, live: 0, finished: 0, confirmed: 10 });
    expect(page.allBonusAdded).toBe(true);
    expect(page.days.map((d) => [d.date, d.matches.length, d.status?.points])).toEqual([
      ["2026-09-04", 1, "p"],
      ["2026-09-05", 7, "p"],
      ["2026-09-06", 2, "p"],
    ]);
    const first = page.matches[0];
    expect(first).toMatchObject({ id: 21, label: "IPS 0–2 LIV", state: "confirmed", bonusSource: "fpl", kickoffLabel: "20:00" });
    expect(first.bonus.map((b) => [b.name, b.value, b.bps])).toEqual([
      ["Isak", 3, 61],
      ["Gakpo", 2, 43],
      ["A.Becker", 1, 35],
    ]);
    expect(first.goals).toEqual([{ id: 379, name: "Isak", side: "away", value: 2 }]);
    expect(page.goals).toBe(page.matches.reduce((n, m) => n + m.home.score! + m.away.score!, 0));
  });

  it("lists everyone who played, best first, with nothing provisional once bonus is in", () => {
    const page = buildLivePage(snapshot)!;
    expect(page.players.length).toBeGreaterThan(200);
    expect(page.players.every((p) => p.minutes > 0 && p.provisionalBonus === 0 && p.projected === p.points)).toBe(true);
    for (let i = 1; i < page.players.length; i++) {
      expect(page.players[i - 1].projected).toBeGreaterThanOrEqual(page.players[i].projected);
    }
    const isak = page.players.find((p) => p.id === 379)!;
    expect(isak).toMatchObject({ team: "LIV", position: "FWD", goals: 2, bonus: 3, matches: [21] });
    // Each player's matches are matches of the gameweek.
    const ids = new Set(page.matches.map((m) => m.id));
    expect(page.players.every((p) => p.matches.length === 1 && ids.has(p.matches[0]))).toBe(true);
  });

  it("adds provisional bonus to a match FPL hasn't settled", () => {
    // Replay fixture 21 as if at full time, before FPL added bonus: no bonus
    // in the match stats or in the live totals.
    const fixtures = snapshot.fixtures.map((f) =>
      f.id === 21
        ? {
            ...f,
            finished: false,
            stats: f.stats.map((s) => (s.identifier === "bonus" ? { ...s, h: [], a: [] } : s)),
          }
        : f,
    );
    const live = {
      ...snapshot.live!,
      elements: snapshot.live!.elements.map((e) =>
        e.explain.some((x) => x.fixture === 21)
          ? { ...e, stats: { ...e.stats, bonus: 0, total_points: e.stats.total_points - e.stats.bonus } }
          : e,
      ),
    };
    const page = buildLivePage({ ...snapshot, fixtures, live })!;
    const match = page.matches.find((m) => m.id === 21)!;
    expect(match.state).toBe("finished");
    expect(match.bonusSource).toBe("provisional");
    expect(page.allBonusAdded).toBe(false);
    const isak = page.players.find((p) => p.id === 379)!;
    expect(isak).toMatchObject({ points: 10, provisionalBonus: 3, bonus: 3, projected: 13 });
  });

  it("handles a gameweek that hasn't kicked off", () => {
    const fixtures = snapshot.fixtures.map((f) =>
      f.event === 3
        ? { ...f, started: false, finished: false, finished_provisional: false, minutes: 0, stats: [], team_h_score: null, team_a_score: null }
        : f,
    );
    const page = buildLivePage({ ...snapshot, fixtures, live: { ...snapshot.live!, elements: [] } })!;
    expect(page.counts.upcoming).toBe(10);
    expect(page.players).toEqual([]);
    expect(page.goals).toBe(0);
    expect(page.matches[0]).toMatchObject({ label: "IPS v LIV", bonusSource: "none", bonus: [] });
  });
});

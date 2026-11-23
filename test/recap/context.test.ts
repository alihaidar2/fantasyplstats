import { describe, expect, it } from "vitest";
import { GameweekContextError, buildGameweekContext, seasonOf } from "../../src/lib/recap/context";
import { leagueTable, ownershipOf } from "../../src/lib/recap/tools/shared";
import { loadContext, loadSources, makeBlank, makeDouble } from "./helpers";

const HAALAND = 411;
const MITCHELL = 204;
const MAN_CITY = 15;
const COVENTRY = 7;
/** Man City v Coventry City in GW3. */
const MCI_COV = 26;

describe("buildGameweekContext", () => {
  it("builds the recorded gameweek", () => {
    const context = loadContext(3);
    expect(context).toMatchObject({ season: "2026-27", gameweek: 3, isLatest: false, hasTransfers: true });
    expect(context.event).toMatchObject({
      averageScore: 51,
      highestScore: 119,
      mostCaptainedId: HAALAND,
      topScorer: { playerId: MITCHELL, points: 15 },
    });
    expect(context.matches).toHaveLength(10);
    expect(context.dreamTeam).toHaveLength(11);
    expect(context.managers.get(3)).toBe(10408519);

    const mitchell = context.playerById.get(MITCHELL)!;
    expect(mitchell).toMatchObject({ ref: "p204", name: "Mitchell", fullName: "Tyrick Mitchell", position: "DEF" });
    expect(mitchell.gw).toMatchObject({ points: 15, goals: 2, minutes: 73, xG: 0.66 });
    expect(mitchell.gw.breakdown[0].lines).toContainEqual({ stat: "goals_scored", value: 2, points: 12 });
    expect(ownershipOf(context, mitchell)).toEqual({ ownedBy: 476563, ownership: "4.6%" });
  });

  it("derives the season from the first deadline", () => {
    expect(seasonOf(loadSources().snapshot)).toBe("2026-27");
  });

  it("builds a league table from results, not FPL's empty table fields", () => {
    const table = leagueTable(loadContext(3));
    expect(table).toHaveLength(20);
    expect(table.every((row) => row.played === 3)).toBe(true);
    expect(table.reduce((sum, row) => sum + row.won, 0)).toBe(table.reduce((sum, row) => sum + row.lost, 0));
    expect(table[0].points).toBeGreaterThanOrEqual(table[1].points);
    expect(table[0].form).toMatch(/^[WDL]{3}$/);
  });

  it("refuses a gameweek that hasn't been played, or the wrong gameweek's fixtures", () => {
    const sources = loadSources(3);
    expect(() => buildGameweekContext(3, { ...sources, live: { elements: [] } })).toThrow(GameweekContextError);
    expect(() => buildGameweekContext(4, sources)).toThrow(/belongs to gameweek 3/);
    expect(() => buildGameweekContext(30, sources)).toThrow(/not in the snapshot/);
  });
});

describe("no hindsight", () => {
  it("keeps nothing from after the gameweek", () => {
    const sources = loadSources(3);
    // The recorded snapshot runs to GW5, so there is later data to leak.
    expect(sources.snapshot.summaries[HAALAND].history.some((h) => h.round > 3)).toBe(true);
    expect(sources.snapshot.fixtures.some((f) => f.event === 4 && f.team_h_score !== null)).toBe(true);

    const context = buildGameweekContext(3, sources);
    for (const player of context.players) {
      expect(player.rounds.every((r) => r.gameweek <= 3)).toBe(true);
    }
    expect(context.results.every((m) => m.gameweek <= 3)).toBe(true);
    expect(context.gameweekScores.map((g) => g.gameweek)).toEqual([1, 2, 3]);
    expect([...context.managers.keys()]).toEqual([1, 2, 3]);
  });

  it("leaves out players who joined after the gameweek", () => {
    const sources = loadSources(3);
    const late = sources.snapshot.bootstrap.elements.find((e) => e.id === MITCHELL)!;
    // As if Mitchell only arrived in GW4: no rows before it and no GW3 live entry.
    sources.snapshot.summaries[late.id].history = sources.snapshot.summaries[late.id].history.filter((h) => h.round >= 4);
    sources.live.elements = sources.live.elements.filter((e) => e.id !== late.id);
    const context = buildGameweekContext(3, sources);
    expect(context.playerById.has(late.id)).toBe(false);
    expect(context.event.topScorer).toBeNull();
    // Still in the name dictionary, so the checker recognises the name and rejects it.
    expect(context.names.some((n) => n.kind === "player" && n.id === late.id)).toBe(true);
  });

  it("only uses today's availability news and event-status for the snapshot's current gameweek", () => {
    // GW4 is the recorded snapshot's current gameweek.
    const past = loadContext(3);
    expect(past.availability).toBeNull();
    expect(past.pointsStatus).toBeNull();

    const current = loadContext(4);
    expect(current.isLatest).toBe(true);
    expect(current.availability?.get(HAALAND)).toMatchObject({ status: expect.any(String) });
    // The recorded event-status describes a later gameweek, so it is ignored.
    expect(current.pointsStatus).toBeNull();

    const settled = loadContext(4, (s) => {
      s.eventStatus = {
        status: [
          { event: 4, date: "2026-09-12", points: "r", bonus_added: true },
          { event: 4, date: "2026-09-13", points: "r", bonus_added: true },
        ],
        leagues: "Updated",
      };
    });
    expect(settled.pointsStatus).toEqual({
      days: [
        { date: "2026-09-12", points: "r", bonusAdded: true },
        { date: "2026-09-13", points: "r", bonusAdded: true },
      ],
      final: true,
    });
    const provisional = loadContext(4, (s) => {
      s.eventStatus = { status: [{ event: 4, date: "2026-09-12", points: "p", bonus_added: false }], leagues: "" };
    });
    expect(provisional.pointsStatus?.final).toBe(false);
  });
});

describe("findings from recording GW1-10", () => {
  it("takes a player's club from the gameweek's fixture, not from today's bootstrap", () => {
    const context = loadContext(3, (s) => {
      // Today Haaland is at Arsenal (a transfer after GW3)...
      s.snapshot.bootstrap.elements.find((e) => e.id === HAALAND)!.team = 1;
    });
    // ...but in GW3 he played at home for Man City.
    expect(context.playerById.get(HAALAND)!.teamId).toBe(MAN_CITY);
  });

  it("follows a transfer made before the gameweek", () => {
    const context = loadContext(3, (s) => {
      // GW1 and GW2 for Coventry, GW3 for Man City: rewrite his first two rows
      // to Coventry fixtures.
      const rows = s.snapshot.summaries[HAALAND].history;
      for (const row of rows.filter((h) => h.round < 3)) {
        const fixture = s.snapshot.fixtures.find(
          (f) => f.event === row.round && (f.team_h === COVENTRY || f.team_a === COVENTRY),
        )!;
        row.fixture = fixture.id;
        row.was_home = fixture.team_h === COVENTRY;
      }
    });
    expect(context.playerById.get(HAALAND)!.teamId).toBe(MAN_CITY);
  });

  it("has no transfer facts in gameweek 1, though FPL fills most_transferred_in in", () => {
    const sources = loadSources(3);
    // Relabel the recorded GW3 as gameweek 1.
    const event3 = sources.snapshot.bootstrap.events.find((e) => e.id === 3)!;
    const event1 = sources.snapshot.bootstrap.events.find((e) => e.id === 1)!;
    Object.assign(event1, { ...event3, id: 1, name: "Gameweek 1" });
    expect(event1.most_transferred_in).not.toBeNull();
    for (const summary of Object.values(sources.snapshot.summaries)) {
      summary.history = summary.history.filter((h) => h.round === 3).map((h) => ({ ...h, round: 1 }));
    }
    for (const fixture of sources.fixtures) fixture.event = 1;

    const context = buildGameweekContext(1, sources);
    expect(context.hasTransfers).toBe(false);
    expect(context.event.mostTransferredInId).toBeNull();
    expect(context.players.every((p) => p.rounds.every((r) => r.transfersBalance === 0))).toBe(true);
    // The other event facts are still there.
    expect(context.event.mostCaptainedId).toBe(HAALAND);
  });

  it("treats a missing live entry as not having played, keeping ownership from the history row", () => {
    const context = loadContext(3, (s) => {
      s.live.elements = s.live.elements.filter((e) => e.id !== HAALAND);
      const row = s.snapshot.summaries[HAALAND].history.find((h) => h.round === 3)!;
      Object.assign(row, { minutes: 0, total_points: 0, goals_scored: 0, bonus: 0, bps: 0 });
    });
    const haaland = context.playerById.get(HAALAND)!;
    expect(haaland.gw).toMatchObject({ minutes: 0, points: 0, goals: 0, breakdown: [] });
    expect(ownershipOf(context, haaland)).toEqual({ ownedBy: 7594638, ownership: "73.0%" });
  });

  it("fills a missing live entry from the history row when the player did play", () => {
    const context = loadContext(3, (s) => {
      s.live.elements = s.live.elements.filter((e) => e.id !== HAALAND);
    });
    expect(context.playerById.get(HAALAND)!.gw).toMatchObject({ minutes: 90, points: 9, goals: 1, bonus: 3 });
  });
});

describe("double and blank gameweeks", () => {
  it("adds a double gameweek's two matches together", () => {
    const context = loadContext(3, (s) => {
      makeDouble(s, MCI_COV);
    });
    expect(context.matches).toHaveLength(11);
    const haaland = context.playerById.get(HAALAND)!;
    expect(haaland.gw).toMatchObject({ points: 18, goals: 2, minutes: 180 });
    expect(haaland.gw.breakdown).toHaveLength(2);
    expect(haaland.rounds.at(-1)).toMatchObject({ gameweek: 3, matches: 2, points: 18, owners: 7594638 });
    expect(leagueTable(context).find((row) => row.teamId === MAN_CITY)!.played).toBe(4);
  });

  it("gives a blank gameweek's players an empty line and no round", () => {
    const context = loadContext(3, (s) => makeBlank(s, MCI_COV));
    expect(context.matches).toHaveLength(9);
    const haaland = context.playerById.get(HAALAND)!;
    expect(haaland.gw).toMatchObject({ points: 0, minutes: 0, breakdown: [] });
    expect(haaland.rounds.map((r) => r.gameweek)).toEqual([1, 2]);
    expect(haaland.teamId).toBe(MAN_CITY);
    expect(ownershipOf(context, haaland)).toBeUndefined();
    expect(leagueTable(context).find((row) => row.teamId === MAN_CITY)!.played).toBe(2);
    expect(context.dreamTeam.some((d) => d.playerId === HAALAND)).toBe(false);
  });
});

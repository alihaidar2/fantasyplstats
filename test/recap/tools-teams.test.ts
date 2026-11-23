import { describe, expect, it } from "vitest";
import { buildGameweekContext, type GameweekContext, type GameweekSources } from "../../src/lib/recap/context";
import { defensiveContributions } from "../../src/lib/recap/tools/defensive-contributions";
import { disciplineAndAvailability } from "../../src/lib/recap/tools/discipline-and-availability";
import { priceChanges } from "../../src/lib/recap/tools/price-changes";
import { seasonRecords } from "../../src/lib/recap/tools/season-records";
import { teamStory } from "../../src/lib/recap/tools/team-story";
import { ToolInputError, type RecapTool } from "../../src/lib/recap/tools/tool";
import { loadContext, loadSources, makeBlank, makeDouble } from "./helpers";

// Team ids in the recorded season.
const ARSENAL = 1;
const CHELSEA = 6;
const ODEGAARD = 15;
const HAALAND = 411;

// Tool results are plain JSON; tests read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = Record<string, any>;

const run = (tool: RecapTool, context: GameweekContext, input: unknown = {}): Result =>
  tool.run(context, tool.input.parse(input), []) as Result;

const names = (rows: Result[] | undefined) => (rows ?? []).map((r) => r.player);

/** GW3's Arsenal v Chelsea (2-1), the fixture the double and blank gameweeks are made from. */
const arsenalChelsea = (sources: GameweekSources) =>
  sources.fixtures.find((f) => f.team_h === ARSENAL && f.team_a === CHELSEA)!.id;

const gw3 = loadContext(3);
const gw4 = loadContext(4);
const double = loadContext(3, (sources) => void makeDouble(sources, arsenalChelsea(sources)));
const blank = loadContext(3, (sources) => makeBlank(sources, arsenalChelsea(sources)));

/** A real gameweek 1: GW3's matches moved to gameweek 1, so nothing comes before them. */
function gameweekOne(): GameweekContext {
  const sources = loadSources(3);
  for (const f of sources.fixtures) f.event = 1;
  return buildGameweekContext(1, sources);
}

const TOOLS: [RecapTool, unknown][] = [
  [defensiveContributions, {}],
  [teamStory, { team: "Arsenal" }],
  [disciplineAndAvailability, {}],
  [priceChanges, {}],
  [seasonRecords, {}],
];

describe("every team and season tool", () => {
  const contexts = { gw3, gw4, double, blank, gameweekOne: gameweekOne() };

  it.each(Object.entries(contexts))("returns plain JSON without nulls or raw timestamps (%s)", (_name, context) => {
    for (const [tool, input] of TOOLS) {
      const result = run(tool, context, input);
      const json = JSON.stringify(result);
      expect(JSON.parse(json)).toEqual(result);
      expect(json).not.toContain("null");
      expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(result.gameweek).toBe(context.gameweek);
    }
  });

  it("stays compact at the default limits", () => {
    for (const context of [gw3, gw4]) {
      for (const [tool, input] of TOOLS) {
        expect(JSON.stringify(run(tool, context, input)).length, tool.name).toBeLessThan(3500);
      }
    }
  });

  it("rejects limits outside the allowed range", () => {
    for (const tool of [defensiveContributions, disciplineAndAvailability, priceChanges, seasonRecords]) {
      expect(tool.input.safeParse({ limit: 0 }).success, tool.name).toBe(false);
      expect(tool.input.safeParse({ limit: 99 }).success, tool.name).toBe(false);
      expect(tool.input.safeParse({ limit: 2.5 }).success, tool.name).toBe(false);
    }
  });
});

describe("defensive_contributions", () => {
  it("ranks the gameweek and the season so far", () => {
    const result = run(defensiveContributions, gw3);
    expect(result.earnedPointsCount).toBe(35);
    expect(result.gameweekLeaders).toHaveLength(5);
    expect(result.gameweekLeaders[0]).toEqual({
      player: "Palacios",
      ref: "p619",
      team: "Ipswich Town",
      position: "MID",
      defensiveContribution: 19,
      clearancesBlocksInterceptions: 3,
      tackles: 4,
      recoveries: 12,
      earnedPoints: 2,
      points: 4,
    });
    expect(result.seasonLeaders[0]).toMatchObject({ player: "Egan", team: "Hull City", defensiveContribution: 41, gameweeksPlayed: 3 });
  });

  it("filters by position and honours the limit", () => {
    const result = run(defensiveContributions, gw3, { position: "DEF", limit: 2 });
    expect(result.position).toBe("DEF");
    expect(result.gameweekLeaders).toHaveLength(2);
    expect(result.gameweekLeaders[0]).toMatchObject({ player: "Fofana", team: "Chelsea", defensiveContribution: 17 });
    for (const row of [...result.gameweekLeaders, ...result.seasonLeaders]) expect(row.position).toBe("DEF");
    expect(defensiveContributions.input.safeParse({ position: "ST" }).success).toBe(false);
  });

  it("adds both matches of a double gameweek together", () => {
    const fofana = run(defensiveContributions, double).gameweekLeaders[0];
    expect(fofana).toMatchObject({ player: "Fofana", defensiveContribution: 34, earnedPoints: 4 });
  });

  it("leaves out clubs with a blank gameweek", () => {
    const leaders = run(defensiveContributions, blank, { limit: 20 }).gameweekLeaders as Result[];
    expect(leaders.length).toBeGreaterThan(0);
    expect(leaders.filter((r) => r.team === "Arsenal" || r.team === "Chelsea")).toEqual([]);
  });
});

describe("team_story", () => {
  it("tells a home win with scorers, assisters, fantasy points and the table", () => {
    const result = run(teamStory, gw3, { team: "Arsenal" });
    expect(result.team).toBe("Arsenal");
    expect(result).not.toHaveProperty("note");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ home: "Arsenal", away: "Chelsea", score: "2-1", venue: "home", cleanSheet: false });
    expect(names(result.matches[0].scorers)).toEqual(["Ødegaard", "Havertz"]);
    expect(names(result.matches[0].assisters)).toEqual(["Rice", "Tzolis"]);
    expect(result.fantasyPoints.clubTotal).toBe(49);
    expect(result.fantasyPoints.topPlayers[0]).toMatchObject({ player: "Ødegaard", team: "Arsenal", points: 10, goals: 1, assists: 0 });
    expect(result.table).toEqual({
      position: 2, played: 3, won: 3, drawn: 0, lost: 0, goalsFor: 6, goalsAgainst: 1, points: 9, form: "WWW",
    });
    expect(result.currentRun).toEqual({ winsInARow: 3, unbeatenInARow: 3, winlessInARow: 0, defeatsInARow: 0 });
  });

  it("tells an away win from the away side, by short name", () => {
    const result = run(teamStory, gw3, { team: "CRY" });
    expect(result.team).toBe("Crystal Palace");
    expect(result.matches[0]).toMatchObject({ home: "Fulham", away: "Crystal Palace", score: "2-3", venue: "away" });
    expect(result.matches[0].scorers).toEqual([
      { player: "Mitchell", ref: "p204", team: "Crystal Palace", position: "DEF", goals: 2 },
      { player: "Chilwell", ref: "p643", team: "Crystal Palace", position: "DEF", goals: 1 },
    ]);
    expect(result.fantasyPoints.topPlayers[0]).toMatchObject({ player: "Mitchell", points: 15 });
    expect(result.table).toMatchObject({ position: 13, won: 1, lost: 2, form: "LLW" });
    expect(result.currentRun).toMatchObject({ winsInARow: 1, defeatsInARow: 0 });
  });

  it("reports clean sheets, losing runs and the opponent's own goals", () => {
    const arsenal = run(teamStory, gw4, { team: "Arsenal" });
    expect(arsenal.matches[0]).toMatchObject({ home: "Sunderland", away: "Arsenal", score: "0-2", cleanSheet: true });
    expect(arsenal.table).toMatchObject({ position: 1, played: 4, points: 12, form: "WWWW" });

    const palace = run(teamStory, gw4, { team: "Crystal Palace" });
    expect(palace.currentRun).toEqual({ winsInARow: 0, unbeatenInARow: 0, winlessInARow: 1, defeatsInARow: 1 });

    // GW3: Newcastle 2-2 Bournemouth, with a Newcastle own goal counting for Bournemouth.
    const bournemouth = run(teamStory, gw3, { team: "Bournemouth" });
    expect(names(bournemouth.matches[0].ownGoalsByOpponent)).toEqual(["Thiaw"]);
    expect(bournemouth.matches[0].ownGoalsByOpponent[0]).toMatchObject({ team: "Newcastle", ownGoals: 1 });
  });

  it("accepts FPL names, short names and common long names, and rejects unknown clubs", () => {
    expect(run(teamStory, gw3, { team: "Manchester City" }).team).toBe("Man City");
    expect(run(teamStory, gw3, { team: "mci" }).team).toBe("Man City");
    expect(() => run(teamStory, gw3, { team: "Real Madrid" })).toThrow(ToolInputError);
    expect(() => run(teamStory, gw3, { team: "Real Madrid" })).toThrow(/No club matches "Real Madrid"/);
    expect(teamStory.input.safeParse({}).success).toBe(false);
    expect(teamStory.input.safeParse({ team: "" }).success).toBe(false);
  });

  it("shows both matches of a double gameweek and counts both in the table", () => {
    const result = run(teamStory, double, { team: "Arsenal" });
    expect(result.note).toMatch(/double gameweek/i);
    expect(result.matches).toHaveLength(2);
    for (const match of result.matches) expect(match).toMatchObject({ home: "Arsenal", away: "Chelsea", score: "2-1" });
    expect(result.fantasyPoints.clubTotal).toBe(98);
    expect(result.table).toMatchObject({ played: 4, won: 4, goalsFor: 8, goalsAgainst: 2, points: 12, form: "WWWW" });
    expect(result.currentRun.winsInARow).toBe(4);
    expect(run(teamStory, double, { team: "Chelsea" }).table.played).toBe(4);
  });

  it("says when the club had no match", () => {
    const result = run(teamStory, blank, { team: "Arsenal" });
    expect(result.note).toMatch(/blank gameweek/i);
    expect(result).not.toHaveProperty("matches");
    expect(result.fantasyPoints).toEqual({ clubTotal: 0 });
    expect(result.table).toMatchObject({ played: 2, won: 2, points: 6, form: "WW" });
    expect(result.currentRun.winsInARow).toBe(2);
  });

  it("puts a player at the club they played for that gameweek, not their club today", () => {
    // Ødegaard scored for Arsenal in GW3. Say he has since moved to Chelsea,
    // so bootstrap-static (today's data) now lists him there.
    const context = loadContext(3, (sources) => {
      sources.snapshot.bootstrap.elements.find((e) => e.id === ODEGAARD)!.team = CHELSEA;
    });
    const arsenal = run(teamStory, context, { team: "Arsenal" });
    expect(arsenal.matches[0].scorers[0]).toMatchObject({ player: "Ødegaard", team: "Arsenal" });
    expect(arsenal.fantasyPoints.topPlayers[0]).toMatchObject({ player: "Ødegaard", team: "Arsenal", points: 10 });
    expect(arsenal.fantasyPoints.clubTotal).toBe(49);

    const chelsea = run(teamStory, context, { team: "Chelsea" });
    expect(JSON.stringify(chelsea)).not.toContain("Ødegaard");
    expect(chelsea.fantasyPoints.clubTotal).toBe(run(teamStory, gw3, { team: "Chelsea" }).fantasyPoints.clubTotal);
  });
});

describe("discipline_and_availability", () => {
  it("lists the gameweek's cards, penalties and own goals", () => {
    const result = run(disciplineAndAvailability, gw4);
    expect(names(result.redCards)).toEqual(["Foden", "Awoniyi", "Reinildo", "Disasi"]);
    expect(result.redCards[0]).toEqual({
      player: "Foden", ref: "p398", team: "Man City", position: "MID", redCards: 1, points: -2, ownership: "3.7%",
    });
    expect(result.penaltiesMissed).toMatchObject([{ player: "E.Le Fée", penaltiesMissed: 1 }]);
    expect(result.penaltiesSaved).toMatchObject([{ player: "Raya", penaltiesSaved: 1, points: 14, ownership: "39.3%" }]);
    expect(result.ownGoals).toMatchObject([{ player: "L.Miley", ownGoals: 1 }]);
    expect(result.yellowCards.playersBooked).toBe(38);
    expect(result.yellowCards.mostOwned[0]).toMatchObject({ player: "Gabriel", yellowCards: 1, ownership: "23.9%" });
  });

  it("leaves out the lists that are empty", () => {
    const result = run(disciplineAndAvailability, gw3);
    expect(result).not.toHaveProperty("redCards");
    expect(result).not.toHaveProperty("penaltiesMissed");
    expect(result.ownGoals).toMatchObject([{ player: "Thiaw", team: "Newcastle", points: -1 }]);
    expect(result.yellowCards.playersBooked).toBe(41);
    expect(run(disciplineAndAvailability, gw3, { limit: 1 }).yellowCards.mostOwned).toHaveLength(1);
  });

  it("lists flagged, widely owned players for the snapshot's current gameweek", () => {
    const context = loadContext(4, (sources) => {
      const haaland = sources.snapshot.bootstrap.elements.find((e) => e.id === HAALAND)!;
      Object.assign(haaland, { status: "d", news: "Knock - 50% chance of playing", chance_of_playing_next_round: 50 });
    });
    expect(context.isLatest).toBe(true);
    const result = run(disciplineAndAvailability, context, { limit: 20 });
    expect(result).not.toHaveProperty("availabilityNote");
    const haaland = (result.availability as Result[]).find((r) => r.player === "Haaland");
    expect(haaland).toMatchObject({
      team: "Man City",
      status: "doubtful",
      news: "Knock - 50% chance of playing",
      chanceOfPlayingNextRound: "50%",
    });
    for (const row of result.availability as Result[]) {
      expect(row.status).not.toBe("available");
      expect(Number.parseFloat(row.ownership)).toBeGreaterThanOrEqual(5);
    }
    // The recorded snapshot's own flags come through as FPL wrote them.
    expect((result.availability as Result[]).find((r) => r.player === "João Pedro")).toMatchObject({
      status: "injured",
      news: "Thigh injury - Unknown return date",
    });
    expect(run(disciplineAndAvailability, context, { limit: 2 }).availability).toHaveLength(2);
  });

  it("says availability news isn't known when looking back at a past gameweek", () => {
    const context = loadContext(3, (sources) => {
      const haaland = sources.snapshot.bootstrap.elements.find((e) => e.id === HAALAND)!;
      Object.assign(haaland, { status: "i", news: "Broken leg", chance_of_playing_next_round: 0 });
    });
    expect(context.isLatest).toBe(false);
    const result = run(disciplineAndAvailability, context);
    expect(result).not.toHaveProperty("availability");
    expect(result.availabilityNote).toMatch(/only known for the current gameweek/);
    expect(JSON.stringify(result)).not.toContain("Broken leg");
    expect(disciplineAndAvailability.description).toMatch(/neither is available when looking back at a past gameweek/);
  });

  it("reports whether points are final only when event-status describes this gameweek", () => {
    const status = (event: number, points: string, bonus_added: boolean) => ({
      status: [
        { event, date: "2026-09-12", points: "r", bonus_added: true },
        { event, date: "2026-09-13", points, bonus_added },
      ],
      leagues: "",
    });
    const final = loadContext(4, (sources) => void (sources.eventStatus = status(4, "r", true)));
    expect(run(disciplineAndAvailability, final).pointsStatus).toEqual({ final: true, bonusAdded: true });

    const provisional = loadContext(4, (sources) => void (sources.eventStatus = status(4, "p", false)));
    expect(run(disciplineAndAvailability, provisional).pointsStatus).toEqual({ final: false, bonusAdded: false });

    // The recorded event-status is about a later gameweek, and GW3 is in the past.
    expect(run(disciplineAndAvailability, gw4)).not.toHaveProperty("pointsStatus");
    const past = loadContext(3, (sources) => void (sources.eventStatus = status(3, "r", true)));
    expect(run(disciplineAndAvailability, past)).not.toHaveProperty("pointsStatus");
  });
});

describe("price_changes", () => {
  it("lists risers and fallers going into the gameweek from the history rows", () => {
    const result = run(priceChanges, gw3);
    expect(result.sinceLastGameweek.playersWhoRose).toBe(13);
    expect(result.sinceLastGameweek.playersWhoFell).toBe(58);
    expect(result.sinceLastGameweek.risers).toHaveLength(5);
    expect(result.sinceLastGameweek.risers[0]).toEqual({
      player: "Cherki", ref: "p399", team: "Man City", position: "MID",
      priceChange: "+£0.2m", price: "£7.7m", points: 3, ownership: "33.0%",
    });
    // Equal moves: the most widely owned first.
    expect(result.sinceLastGameweek.risers[1]).toMatchObject({ player: "João Pedro", priceChange: "+£0.1m", ownership: "69.0%" });
    expect(result.sinceLastGameweek.fallers[0]).toMatchObject({ player: "Konsa", priceChange: "-£0.1m", price: "£4.4m" });
    expect(result.sinceFirstGameweek.risers[0]).toEqual({
      player: "João Pedro", ref: "p165", team: "Chelsea", position: "FWD", priceChange: "+£0.2m", price: "£7.7m",
    });
    expect(result.sinceFirstGameweek.fallers[0]).toMatchObject({ player: "Gyökeres", priceChange: "-£0.2m" });
    expect(run(priceChanges, gw3, { limit: 2 }).sinceLastGameweek.fallers).toHaveLength(2);
  });

  it("uses the prices recorded that gameweek, never today's", () => {
    const context = loadContext(3, (sources) => {
      for (const e of sources.snapshot.bootstrap.elements) {
        e.now_cost += 20;
        e.cost_change_event = 5;
        e.cost_change_start = 20;
      }
    });
    expect(run(priceChanges, context)).toEqual(run(priceChanges, gw3));
    // GW4 knows GW4's prices; GW3 never sees them.
    expect(run(priceChanges, gw4).sinceFirstGameweek.risers[0]).toMatchObject({ player: "Calafiori", priceChange: "+£0.3m", price: "£5.8m" });
    expect(JSON.stringify(run(priceChanges, gw3, { limit: 20 }))).not.toContain("£0.3m");
  });

  it("has nothing to report in gameweek 1, which has no transfers", () => {
    const note = /Gameweek 1 has no transfers/;
    const first = gameweekOne();
    expect(first.hasTransfers).toBe(false);
    const result = run(priceChanges, first);
    expect(Object.keys(result)).toEqual(["gameweek", "note"]);
    expect(result.note).toMatch(note);

    const flagged = run(priceChanges, { ...gw3, hasTransfers: false });
    expect(Object.keys(flagged)).toEqual(["gameweek", "note"]);
    expect(priceChanges.description).toMatch(/Gameweek 1 has no transfers/);
  });

  it("copes with double and blank gameweeks", () => {
    // A double gameweek's two rows carry one price, so the same players move
    // by the same amounts; only their points (two matches) differ.
    const moves = (result: Result) =>
      [...result.sinceLastGameweek.risers, ...result.sinceLastGameweek.fallers].map((r: Result) => [r.player, r.priceChange, r.price]);
    expect(moves(run(priceChanges, double))).toEqual(moves(run(priceChanges, gw3)));
    expect(run(priceChanges, double).sinceFirstGameweek).toEqual(run(priceChanges, gw3).sinceFirstGameweek);
    expect(run(priceChanges, double).sinceLastGameweek.risers[2]).toMatchObject({ player: "Calafiori", points: 4 });

    // Clubs without a match have no price row, so their players drop out.
    const rows = run(priceChanges, blank, { limit: 20 });
    const all = [
      ...rows.sinceLastGameweek.risers,
      ...rows.sinceLastGameweek.fallers,
      ...rows.sinceFirstGameweek.risers,
      ...rows.sinceFirstGameweek.fallers,
    ] as Result[];
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((r) => r.team === "Arsenal" || r.team === "Chelsea")).toEqual([]);
    expect(names(run(priceChanges, gw3).sinceLastGameweek.risers)).toContain("Calafiori");
  });
});

describe("season_records", () => {
  it("sets the gameweek against the season so far", () => {
    const result = run(seasonRecords, gw3);
    expect(result).not.toHaveProperty("note");
    expect(result.managerScores).toEqual({
      byGameweek: [
        { gameweek: 1, averageScore: 50, highestScore: 131 },
        { gameweek: 2, averageScore: 81, highestScore: 161 },
        { gameweek: 3, averageScore: 51, highestScore: 119 },
      ],
      thisAverageIsTheHighestSoFar: false,
      thisAverageIsTheLowestSoFar: false,
    });
    expect(result.highestIndividualScores[0]).toEqual({
      player: "B.Fernandes", ref: "p426", team: "Man Utd", position: "MID", points: 23, gameweek: 2,
    });
    expect(result.thisGameweekHasTheBestScoreSoFar).toBe(false);
    expect(result.seasonLeaders.points[0]).toMatchObject({ player: "Gakpo", points: 28 });
    expect(names(result.seasonLeaders.goals).slice(0, 3)).toEqual(["Isak", "Haaland", "B.Fernandes"]);
    expect(result.seasonLeaders.assists[0]).toMatchObject({ player: "Gakpo", assists: 3 });
    expect(result.biggestWins[0]).toEqual({ home: "Brighton", away: "Aston Villa", score: "4-0", gameweek: 1, margin: 4 });
    expect(result.thisGameweekHasTheBiggestWinSoFar).toBe(false);
    expect(result.goalsPerGameweek).toEqual([
      { gameweek: 1, matches: 10, goals: 30 },
      { gameweek: 2, matches: 10, goals: 32 },
      { gameweek: 3, matches: 10, goals: 23 },
    ]);
    expect(result.thisGameweekHasTheMostGoalsSoFar).toBe(false);
  });

  it("flags a new season high, and never looks past the gameweek", () => {
    const later = run(seasonRecords, gw4);
    expect(later.biggestWins[0]).toEqual({ home: "Coventry City", away: "Brighton", score: "0-5", gameweek: 4, margin: 5 });
    expect(later.thisGameweekHasTheBiggestWinSoFar).toBe(true);
    expect(later.managerScores.byGameweek).toHaveLength(4);

    // The snapshot runs to GW5 and beyond; GW3's records stop at GW3.
    const earlier = run(seasonRecords, gw3, { limit: 10 });
    const gameweeks = [
      ...earlier.managerScores.byGameweek,
      ...earlier.highestIndividualScores,
      ...earlier.biggestWins,
      ...earlier.goalsPerGameweek,
    ].map((r: Result) => r.gameweek);
    expect(Math.max(...gameweeks)).toBe(3);
    expect(JSON.stringify(earlier)).not.toContain("0-5");
  });

  it("flags the highest and lowest manager averages", () => {
    const high = { ...gw3, event: { ...gw3.event, averageScore: 90 }, gameweekScores: gw3.gameweekScores.map((g) => (g.gameweek === 3 ? { ...g, averageScore: 90 } : g)) };
    expect(run(seasonRecords, high).managerScores).toMatchObject({ thisAverageIsTheHighestSoFar: true, thisAverageIsTheLowestSoFar: false });
    const low = { ...gw3, event: { ...gw3.event, averageScore: 40 }, gameweekScores: gw3.gameweekScores.map((g) => (g.gameweek === 3 ? { ...g, averageScore: 40 } : g)) };
    expect(run(seasonRecords, low).managerScores).toMatchObject({ thisAverageIsTheHighestSoFar: false, thisAverageIsTheLowestSoFar: true });
  });

  it("has nothing to compare the first gameweek with", () => {
    const result = run(seasonRecords, gameweekOne());
    expect(result.note).toMatch(/first gameweek/i);
    expect(result.managerScores.byGameweek).toHaveLength(1);
    expect(result.managerScores).not.toHaveProperty("thisAverageIsTheHighestSoFar");
    expect(result).not.toHaveProperty("thisGameweekHasTheBestScoreSoFar");
    expect(result).not.toHaveProperty("thisGameweekHasTheBiggestWinSoFar");
    expect(result).not.toHaveProperty("thisGameweekHasTheMostGoalsSoFar");
  });

  it("counts a double gameweek's extra match and a blank gameweek's missing one", () => {
    expect(run(seasonRecords, double).goalsPerGameweek[2]).toEqual({ gameweek: 3, matches: 11, goals: 26 });
    expect(run(seasonRecords, blank).goalsPerGameweek[2]).toEqual({ gameweek: 3, matches: 9, goals: 20 });
    // Ødegaard's 10 points become 20 over two matches: the best score of the gameweek, but not of the season.
    const scores = run(seasonRecords, double, { limit: 10 }).highestIndividualScores as Result[];
    expect(scores.find((s) => s.player === "Ødegaard")).toMatchObject({ points: 20, gameweek: 3 });
    expect(seasonRecords.input.safeParse({ limit: 11 }).success).toBe(false);
  });
});

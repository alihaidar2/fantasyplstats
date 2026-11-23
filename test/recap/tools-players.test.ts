import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { buildGameweekContext, type GameweekContext, type GameweekSources } from "../../src/lib/recap/context";
import { expectedVsActual } from "../../src/lib/recap/tools/expected-vs-actual";
import { findPlayers } from "../../src/lib/recap/tools/find-players";
import { ownershipOutcomes } from "../../src/lib/recap/tools/ownership-outcomes";
import { ToolInputError, type RecapTool } from "../../src/lib/recap/tools/tool";
import { topPerformers } from "../../src/lib/recap/tools/top-performers";
import { loadContext, loadSources, makeBlank, makeDouble } from "./helpers";

// Recorded GW3 of 2026/27. Fixture 26 is Man City 1-0 Coventry City: Haaland
// (p411) scored, O'Reilly (p387, 18.6% owned) stayed on the bench.
const MCI_COV = 26;
const HAALAND = 411;
const O_REILLY = 387;

/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are plain JSON */
function run<S extends z.ZodType>(tool: RecapTool<S>, context: GameweekContext, input: z.input<S>): any {
  const result = tool.run(context, tool.input.parse(input), []);
  // What the evidence log will hold: plain JSON, with nothing left as null.
  const json = JSON.stringify(result);
  expect(json).not.toContain("null");
  return JSON.parse(json);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const names = (rows: { player: string }[]) => rows.map((r) => r.player);

/** Relabels the recorded GW3 as the season's first gameweek, leaving FPL's transfer figures in place. */
function asGameweekOne(sources: GameweekSources): void {
  const { snapshot } = sources;
  for (const fixture of sources.fixtures) fixture.event = 1;
  snapshot.fixtures = snapshot.fixtures.filter((f) => f.event !== null && f.event >= 3);
  for (const fixture of snapshot.fixtures) if (fixture.event === 3) fixture.event = 1;
  for (const summary of Object.values(snapshot.summaries)) {
    summary.history = summary.history.filter((h) => h.round >= 3);
    for (const row of summary.history) if (row.round === 3) row.round = 1;
  }
  const third = snapshot.bootstrap.events.find((e) => e.id === 3)!;
  snapshot.bootstrap.events = snapshot.bootstrap.events
    .filter((e) => e.id !== 1)
    .map((e) => (e === third ? { ...e, id: 1, name: "Gameweek 1" } : e));
}

describe("top_performers", () => {
  const context = loadContext(3);

  it("lists the gameweek's highest scorers with price, ownership and season points", () => {
    const result = run(topPerformers, context, {});
    expect(result.gameweek).toBe(3);
    expect(result.players).toHaveLength(10);
    expect(result.players[0]).toEqual({
      player: "Mitchell",
      ref: "p204",
      team: "Crystal Palace",
      position: "DEF",
      points: 15,
      minutes: 73,
      goals: 2,
      assists: 0,
      bonus: 2,
      price: "£4.5m",
      ownedBy: 476563,
      ownership: "4.6%",
      seasonPoints: 16,
    });
    const points = result.players.map((p: { points: number }) => p.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(result.doubleDigitHauls).toBe(13);
    // Clean sheets and saves only when there are any.
    expect(result.players[1]).toMatchObject({ player: "Bogle", cleanSheets: 1 });
    expect(result.players[0]).not.toHaveProperty("saves");
  });

  it("filters by position, club and ownership", () => {
    const mids = run(topPerformers, context, { position: "MID", maxOwnershipPercent: 5, limit: 3 });
    expect(names(mids.players)).toEqual(["Barnes", "Janelt", "Tavernier"]);
    expect(mids.players.every((p: { position: string }) => p.position === "MID")).toBe(true);
    // The count of hauls ignores the filters.
    expect(mids.doubleDigitHauls).toBe(13);

    const city = run(topPerformers, context, { team: "MCI", limit: 20 });
    expect(city.players.length).toBeGreaterThan(0);
    expect(city.players.every((p: { team: string }) => p.team === "Man City")).toBe(true);
    expect(city.players[0]).toMatchObject({ player: "Haaland", points: 9, ownership: "73.0%" });
    // Nobody who didn't play.
    expect(names(city.players)).not.toContain("O'Reilly");
  });

  it("rejects bad input", () => {
    expect(() => topPerformers.input.parse({ limit: 0 })).toThrow();
    expect(() => topPerformers.input.parse({ limit: 21 })).toThrow();
    expect(() => topPerformers.input.parse({ position: "ST" })).toThrow();
    expect(() => topPerformers.input.parse({ maxOwnershipPercent: 101 })).toThrow();
    expect(() => run(topPerformers, context, { team: "Narnia" })).toThrow(ToolInputError);
  });

  it("adds a double gameweek's two matches together, listing the player once", () => {
    const double = loadContext(3, (sources) => makeDouble(sources, MCI_COV));
    const result = run(topPerformers, double, {});
    expect(result.players[0]).toMatchObject({
      player: "Haaland",
      points: 18,
      minutes: 180,
      goals: 2,
      ownership: "73.0%",
      seasonPoints: 33,
    });
    expect(names(result.players).filter((n) => n === "Haaland")).toHaveLength(1);
  });

  it("has nobody from a club with a blank gameweek", () => {
    const blank = loadContext(3, (sources) => makeBlank(sources, MCI_COV));
    const city = run(topPerformers, blank, { team: "Man City" });
    expect(city.players).toEqual([]);
    expect(city.note).toMatch(/No player/);
    expect(names(run(topPerformers, blank, { limit: 20 }).players)).not.toContain("Haaland");
  });
});

describe("find_players", () => {
  const context = loadContext(3);

  it("finds players by name and gives their refs", () => {
    const wilsons = run(findPlayers, context, { name: "Wilson" });
    expect(wilsons.matched).toBe(2);
    expect(wilsons.players.map((p: { ref: string; team: string }) => [p.ref, p.team])).toEqual([
      ["p108", "Brentford"],
      ["p260", "Leeds"],
    ]);
    expect(wilsons.players[0]).toEqual({
      player: "Wilson",
      ref: "p108",
      team: "Brentford",
      position: "FWD",
      fullName: "Callum Wilson",
      points: 1,
      minutes: 4,
      seasonPoints: 3,
      price: "£5.5m",
      ownedBy: 38790,
      ownership: "0.4%",
    });
  });

  it("matches a full name, part of a name, and ignores accents", () => {
    expect(names(run(findPlayers, context, { name: "Bruno Fernandes" }).players)).toEqual(["B.Fernandes"]);
    expect(names(run(findPlayers, context, { name: "odegaard" }).players)).toEqual(["Ødegaard"]);
    // Not a whole name, so it falls back to a substring.
    expect(names(run(findPlayers, context, { name: "Haal" }).players)).toEqual(["Haaland"]);
  });

  it("filters by club, position and points, and sorts as asked", () => {
    const arsenal = run(findPlayers, context, { team: "ARS", sortBy: "ownership", limit: 3 });
    expect(arsenal.matched).toBe(19);
    expect(names(arsenal.players)).toEqual(["Calafiori", "Raya", "Gabriel"]);
    expect(arsenal.players[0].ownership).toBe("44.6%");

    const defenders = run(findPlayers, context, { position: "DEF", minPoints: 12 });
    expect(names(defenders.players)).toEqual(["Mitchell", "Bogle", "Vuskovic"]);

    const dearest = run(findPlayers, context, { sortBy: "price", limit: 1 });
    expect(dearest.players[0]).toMatchObject({ player: "Haaland", price: "£15.5m" });

    const season = run(findPlayers, context, { sortBy: "season points", limit: 5 });
    const totals = season.players.map((p: { seasonPoints: number }) => p.seasonPoints);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it("returns an empty list with a note when nothing matches", () => {
    const none = run(findPlayers, context, { name: "Zzyzx" });
    expect(none).toMatchObject({ matched: 0, players: [] });
    expect(none.note).toMatch(/No player matches/);
  });

  it("rejects bad input", () => {
    expect(() => findPlayers.input.parse({ sortBy: "form" })).toThrow();
    expect(() => findPlayers.input.parse({ name: "" })).toThrow();
    expect(() => findPlayers.input.parse({ minPoints: 2.5 })).toThrow();
    expect(() => run(findPlayers, context, { team: "Narnia" })).toThrow(ToolInputError);
  });

  it("counts a double gameweek once per player", () => {
    const double = loadContext(3, (sources) => makeDouble(sources, MCI_COV));
    const result = run(findPlayers, double, { name: "Haaland" });
    expect(result.players).toHaveLength(1);
    expect(result.players[0]).toMatchObject({ points: 18, minutes: 180, seasonPoints: 33, ownership: "73.0%" });
  });

  it("gives no ownership for a player whose club had a blank gameweek", () => {
    const blank = loadContext(3, (sources) => makeBlank(sources, MCI_COV));
    const [haaland] = run(findPlayers, blank, { name: "Haaland" }).players;
    expect(haaland).toMatchObject({ points: 0, minutes: 0, seasonPoints: 15, price: "£15.5m" });
    expect(haaland).not.toHaveProperty("ownership");
    expect(haaland).not.toHaveProperty("ownedBy");
    // Sorting by ownership still works, with the blanked players last.
    const byOwnership = run(findPlayers, blank, { sortBy: "ownership", limit: 1 });
    expect(byOwnership.players[0]).toMatchObject({ player: "João Pedro", ownership: "69.0%" });
  });
});

describe("ownership_outcomes", () => {
  const context = loadContext(3);

  it("says how the most-owned, the captain's pick, differentials and transfers got on", () => {
    const result = run(ownershipOutcomes, context, {});
    expect(names(result.mostOwned)).toEqual(["Haaland", "João Pedro", "B.Fernandes", "Calafiori"]);
    expect(result.mostOwned[0]).toEqual({
      player: "Haaland",
      ref: "p411",
      team: "Man City",
      position: "FWD",
      ownedBy: 7594638,
      ownership: "73.0%",
      points: 9,
      minutes: 90,
      goals: 1,
      assists: 0,
      returned: true,
    });
    expect(result.mostOwned[1]).toMatchObject({ player: "João Pedro", ownership: "69.0%", points: 1, returned: false });
    expect(result.mostCaptained).toMatchObject({ player: "Haaland", points: 9, ownership: "73.0%" });

    expect(names(result.differentials)).toEqual(["Mitchell", "Bogle", "Barnes", "Vuskovic"]);
    expect(result.differentials[0]).toMatchObject({ points: 15, ownership: "4.6%" });

    expect(result.mostBoughtBeforeDeadline[0]).toMatchObject({
      player: "Cherki",
      netTransfersIn: 1783948,
      points: 3,
      ownership: "33.0%",
    });
    expect(result.mostSoldBeforeDeadline[0]).toMatchObject({ player: "Mbeumo", netTransfersIn: -752284, points: 8 });
    expect(result).not.toHaveProperty("transfersNote");
  });

  it("lists widely owned players who didn't play, most owned first", () => {
    const result = run(ownershipOutcomes, context, {});
    expect(result.ownedButDidNotPlay).toEqual([
      { player: "O'Reilly", ref: "p387", team: "Man City", position: "DEF", ownedBy: 1933486, ownership: "18.6%", points: 0, minutes: 0 },
      { player: "Dubravka", ref: "p497", team: "Spurs", position: "GKP", ownedBy: 1908726, ownership: "18.3%", points: 0, minutes: 0 },
      { player: "Kusi-Asare", ref: "p272", team: "Fulham", position: "FWD", ownedBy: 689011, ownership: "6.6%", points: 0, minutes: 0 },
      { player: "Senesi", ref: "p498", team: "Spurs", position: "DEF", ownedBy: 558130, ownership: "5.4%", points: 0, minutes: 0 },
    ]);
  });

  it("treats a player missing from the live data as not having played, using the history row for ownership", () => {
    // Recorded live files can drop players with 0 minutes and 0 points.
    const dropped = loadContext(3, (sources) => {
      sources.live.elements = sources.live.elements.filter((e) => e.id !== O_REILLY && e.id !== HAALAND);
      // Haaland played in the recording, so give him the row of a player who didn't.
      const row = sources.snapshot.summaries[HAALAND].history.find((h) => h.round === 3)!;
      Object.assign(row, { minutes: 0, total_points: 0, goals_scored: 0, bonus: 0, bps: 0 });
    });
    const result = run(ownershipOutcomes, dropped, {});
    expect(result.ownedButDidNotPlay.slice(0, 2)).toEqual([
      { player: "Haaland", ref: "p411", team: "Man City", position: "FWD", ownedBy: 7594638, ownership: "73.0%", points: 0, minutes: 0 },
      { player: "O'Reilly", ref: "p387", team: "Man City", position: "DEF", ownedBy: 1933486, ownership: "18.6%", points: 0, minutes: 0 },
    ]);
    expect(result.mostOwned[0]).toMatchObject({ player: "Haaland", minutes: 0, points: 0, returned: false });
    expect(result.mostCaptained).toMatchObject({ player: "Haaland", points: 0, minutes: 0 });
  });

  it("reports no transfer story when transfers are unavailable", () => {
    const result = run(ownershipOutcomes, { ...context, hasTransfers: false }, {});
    expect(result).not.toHaveProperty("mostBoughtBeforeDeadline");
    expect(result).not.toHaveProperty("mostSoldBeforeDeadline");
    expect(result.transfersNote).toMatch(/Gameweek 1 has no transfers/);
    expect(result.mostOwned).toHaveLength(4);
  });

  it("reports no transfer story for gameweek 1, even though FPL fills the figures in", () => {
    const sources = loadSources(3);
    asGameweekOne(sources);
    // FPL's own data still names a most-transferred-in player and transfer balances.
    expect(sources.snapshot.bootstrap.events.find((e) => e.id === 1)!.most_transferred_in).toBe(399);
    expect(sources.snapshot.summaries[399].history.find((h) => h.round === 1)!.transfers_balance).toBe(1783948);

    const first = buildGameweekContext(1, sources);
    expect(first.hasTransfers).toBe(false);
    const result = run(ownershipOutcomes, first, {});
    expect(result.gameweek).toBe(1);
    expect(result).not.toHaveProperty("mostBoughtBeforeDeadline");
    expect(result).not.toHaveProperty("mostSoldBeforeDeadline");
    expect(result.transfersNote).toMatch(/no transfers/);
    expect(JSON.stringify(result)).not.toContain("netTransfersIn");
    // Ownership itself is real in gameweek 1.
    expect(result.mostOwned[0]).toMatchObject({ player: "Haaland", ownership: "73.0%" });
  });

  it("rejects bad input", () => {
    expect(() => ownershipOutcomes.input.parse({ limit: 0 })).toThrow();
    expect(() => ownershipOutcomes.input.parse({ limit: 11 })).toThrow();
    expect(() => ownershipOutcomes.input.parse({ limit: "5" })).toThrow();
  });

  it("counts a double gameweek's points once per player", () => {
    const double = loadContext(3, (sources) => makeDouble(sources, MCI_COV));
    const result = run(ownershipOutcomes, double, {});
    expect(result.mostOwned[0]).toMatchObject({ player: "Haaland", points: 18, minutes: 180, goals: 2, ownership: "73.0%" });
    expect(names(result.mostOwned).filter((n) => n === "Haaland")).toHaveLength(1);
    // O'Reilly sat out both matches.
    expect(result.ownedButDidNotPlay[0]).toMatchObject({ player: "O'Reilly", minutes: 0, ownership: "18.6%" });
  });

  it("leaves a blank gameweek's players out of every ownership list", () => {
    const blank = loadContext(3, (sources) => makeBlank(sources, MCI_COV));
    const result = run(ownershipOutcomes, blank, { limit: 10 });
    const listed = [
      ...result.mostOwned,
      ...result.ownedButDidNotPlay,
      ...result.differentials,
      ...result.mostBoughtBeforeDeadline,
      ...result.mostSoldBeforeDeadline,
    ];
    // No Man City or Coventry City player: they have no ownership figure this gameweek.
    expect(listed.filter((p) => p.team === "Man City" || p.team === "Coventry City")).toEqual([]);
    expect(names(result.mostOwned)[0]).toBe("João Pedro");
    expect(names(result.ownedButDidNotPlay)).not.toContain("O'Reilly");
    // The captain's pick is still named, with no points and no invented ownership.
    expect(result.mostCaptained).toMatchObject({ player: "Haaland", points: 0, minutes: 0, returned: false });
    expect(result.mostCaptained).not.toHaveProperty("ownership");
  });
});

describe("expected_vs_actual", () => {
  const context = loadContext(3);

  it("compares goals and assists with xG and xA for the gameweek", () => {
    const result = run(expectedVsActual, context, {});
    expect(result.scope).toBe("this gameweek");
    expect(names(result.overperformers)).toEqual(["Scott", "Barnes", "Isak", "Gakpo", "Mitchell"]);
    expect(result.overperformers[0]).toEqual({
      player: "Scott",
      ref: "p69",
      team: "Bournemouth",
      position: "MID",
      goals: 0,
      assists: 2,
      xG: 0.07,
      xA: 0.02,
      xGI: 0.09,
      difference: 1.91,
      points: 10,
    });
    // Underperformers had chances and nothing to show for them.
    expect(result.underperformers[0]).toMatchObject({ player: "Bobb", goals: 0, assists: 0, xG: 0.32, xA: 0.65, difference: -0.97 });
    expect(result.underperformers.every((p: { goals: number; assists: number }) => p.goals + p.assists === 0)).toBe(true);
    expect(result.highestExpected.slice(0, 2).map((p: { player: string; xGI: number }) => [p.player, p.xGI])).toEqual([
      ["Ødegaard", 1.6],
      ["Haaland", 1.54],
    ]);
  });

  it("covers the season up to this gameweek, and nothing later", () => {
    const result = run(expectedVsActual, context, { scope: "season", limit: 3 });
    expect(result.scope).toMatch(/season/);
    expect(result.overperformers[0]).toMatchObject({ player: "Gakpo", goals: 1, assists: 3, xG: 0.36, xA: 1.2, difference: 2.44 });
    expect(result.underperformers[0]).toMatchObject({ player: "Thiago", goals: 0, xG: 2.3, difference: -2.4 });
    // Haaland had 3 goals after GW3; the snapshot also holds his GW4 and GW5.
    expect(result.highestExpected[1]).toMatchObject({ player: "Haaland", goals: 3, xG: 2.46, xA: 0.5, xGI: 2.96 });
    expect(result.overperformers[0]).not.toHaveProperty("points");

    // The same question asked a gameweek later sees one more gameweek.
    const later = run(expectedVsActual, loadContext(4), { scope: "season", limit: 10 });
    const haaland = [...later.highestExpected, ...later.overperformers].find((p) => p.player === "Haaland");
    expect(haaland.goals).toBeGreaterThanOrEqual(3);
    expect(haaland.xG).toBeGreaterThan(2.46);
  });

  it("rejects bad input", () => {
    expect(() => expectedVsActual.input.parse({ scope: "month" })).toThrow();
    expect(() => expectedVsActual.input.parse({ limit: 0 })).toThrow();
    expect(() => expectedVsActual.input.parse({ limit: 11 })).toThrow();
  });

  it("adds a double gameweek's expected figures together", () => {
    const double = loadContext(3, (sources) => makeDouble(sources, MCI_COV));
    const gameweek = run(expectedVsActual, double, {});
    expect(gameweek.highestExpected[0]).toMatchObject({ player: "Haaland", goals: 2, xG: 2.12, xA: 0.96, xGI: 3.08, points: 18 });
    expect(names(gameweek.highestExpected).filter((n) => n === "Haaland")).toHaveLength(1);

    const season = run(expectedVsActual, double, { scope: "season" });
    expect(season.highestExpected[0]).toMatchObject({ player: "Haaland", goals: 4, xG: 3.52 });
  });

  it("has nobody from a blanked club in the gameweek, but keeps their season", () => {
    const blank = loadContext(3, (sources) => makeBlank(sources, MCI_COV));
    const gameweek = run(expectedVsActual, blank, { limit: 10 });
    const listed = [...gameweek.overperformers, ...gameweek.underperformers, ...gameweek.highestExpected];
    expect(listed.filter((p) => p.team === "Man City" || p.team === "Coventry City")).toEqual([]);

    // Over the season they still count, with one gameweek fewer: Haaland drops
    // from second for expected goal involvements to outside the top ten.
    const season = run(expectedVsActual, blank, { scope: "season", limit: 10 });
    expect(season.highestExpected[0]).toMatchObject({ player: "B.Fernandes", goals: 3, xG: 2.25 });
    expect(names(season.highestExpected)).not.toContain("Haaland");
    expect(names(run(expectedVsActual, context, { scope: "season", limit: 10 }).highestExpected)).toContain("Haaland");
  });
});

// Step 5a: the extra player stats (table views, player page charts, set pieces
// and availability), built from the recorded responses in test/fixtures/.

import { describe, expect, it } from "vitest";
import {
  availabilityOf,
  bootstrapSchema,
  buildPlayerDetail,
  buildPlayerGameweeks,
  buildPlayerRows,
  elementSummarySchema,
  foldForSearch,
  matchesPlayerSearch,
  setPieceDuties,
  type Element,
} from "../src/lib/fpl";
import { loadBootstrap, loadRaw, loadSummary } from "./helpers";

const element = (id: number): Element => loadBootstrap().elements.find((e) => e.id === id)!;
const row = (id: number) => buildPlayerRows(loadBootstrap()).find((r) => r.id === id)!;

describe("widened schemas", () => {
  it("keep the new player fields with the right types", () => {
    const gabriel = element(4);
    expect(gabriel).toMatchObject({
      expected_goal_involvements: "1.72",
      expected_goals_per_90: 0.15,
      defensive_contribution: 91,
      defensive_contribution_per_90: 9.1,
      clearances_blocks_interceptions: 77,
      tackles: 14,
      recoveries: 30,
      transfers_in_event: 4067,
      transfers_out_event: 684,
      cost_change_start: 1,
      chance_of_playing_next_round: null,
    });
  });

  it("drop FPL's price projections, expected points and ranks", () => {
    const raya = element(1) as Record<string, unknown>;
    for (const key of ["price_change_percent", "price_change_projections", "ep_next", "ep_this", "now_cost_rank", "form_rank"]) {
      expect(raya).not.toHaveProperty(key);
    }
  });

  it("keep the gameweek summary fields, which are null before a gameweek is played", () => {
    const gw1 = loadBootstrap().events[0];
    expect(gw1).toMatchObject({
      data_checked: true,
      average_entry_score: 50,
      highest_score: 131,
      most_captained: 411,
      most_transferred_in: 1,
      top_element_info: { id: 115, points: 17 },
    });
    expect(gw1.chip_plays).toContainEqual({ chip_name: "bboost", num_played: 814606 });

    const raw = loadRaw("bootstrap-static.json") as { events: Record<string, unknown>[] };
    Object.assign(raw.events[5], {
      finished: false,
      data_checked: false,
      average_entry_score: 0,
      highest_score: null,
      most_captained: null,
      most_transferred_in: null,
      top_element_info: null,
      chip_plays: [],
    });
    expect(bootstrapSchema.safeParse(raw).success).toBe(true);
  });

  it("reject a string where FPL sends a per-90 number", () => {
    const raw = loadRaw("bootstrap-static.json") as { elements: Record<string, unknown>[] };
    raw.elements[0].saves_per_90 = "2.0";
    expect(bootstrapSchema.safeParse(raw).success).toBe(false);
  });

  it("keep the new per-gameweek history fields", () => {
    const [gw1] = loadSummary(1).history;
    expect(gw1).toMatchObject({ value: 60, selected: 3347153, transfers_balance: 0, bps: 24, bonus: 0 });
    expect(gw1).toHaveProperty("defensive_contribution", 0);
    expect(gw1).toHaveProperty("goals_scored", 0);
  });

  it("reject a history row missing the price", () => {
    const raw = loadRaw("element-summary-1.json") as { history: Record<string, unknown>[] };
    delete raw.history[0].value;
    expect(elementSummarySchema.safeParse(raw).success).toBe(false);
  });
});

describe("availabilityOf", () => {
  it("is null for a fully available player", () => {
    expect(availabilityOf(element(1))).toBeNull();
    // J.Timber: status "a" with a 100% chance.
    expect(availabilityOf(element(5))).toBeNull();
  });

  it("reports an injury with FPL's chance and news", () => {
    expect(availabilityOf(element(12))).toEqual({
      status: "injured",
      chance: 0,
      news: "Thigh injury - Expected back 20 Dec",
    });
  });

  it("treats a doubtful player, or an available one below 100%, as doubtful", () => {
    const base = { news: "Knock - 75% chance of playing" };
    expect(availabilityOf({ ...base, status: "d", chance_of_playing_next_round: 75 })).toEqual({
      status: "doubtful",
      chance: 75,
      news: base.news,
    });
    expect(availabilityOf({ ...base, status: "a", chance_of_playing_next_round: 50 })?.status).toBe("doubtful");
    expect(availabilityOf({ news: "", status: "s", chance_of_playing_next_round: null })).toEqual({
      status: "suspended",
      chance: null,
      news: "",
    });
  });
});

describe("setPieceDuties", () => {
  it("lists only the duties a player has, in FPL's order", () => {
    expect(setPieceDuties(element(12))).toEqual([
      { kind: "penalties", order: 1 },
      { kind: "freekicks", order: 2 },
      { kind: "corners", order: 2 },
    ]);
    expect(setPieceDuties(element(430))).toEqual([
      { kind: "freekicks", order: 4 },
      { kind: "corners", order: 2 },
    ]);
    expect(setPieceDuties(element(1))).toEqual([]);
  });
});

describe("players table rows", () => {
  it("compute goals minus xG without floating-point noise", () => {
    // Saka: 3 goals from 3.63 xG.
    expect(row(12).goalsMinusXg).toBe(-0.63);
    // Gabriel: 1 goal from 1.47 xG.
    expect(row(4).goalsMinusXg).toBe(-0.47);
    expect(row(1).goalsMinusXg).toBe(0);
  });

  it("fill the attack view", () => {
    expect(row(12)).toMatchObject({
      xg: 3.63,
      xgi: 4.83,
      xgPer90: 0.55,
      xaPer90: 0.18,
      xgiPer90: 0.73,
      setPieces: [
        { kind: "penalties", order: 1 },
        { kind: "freekicks", order: 2 },
        { kind: "corners", order: 2 },
      ],
    });
  });

  it("fill the defence view", () => {
    expect(row(4)).toMatchObject({
      defensiveContribution: 91,
      defensiveContributionPer90: 9.1,
      cbi: 77,
      tackles: 14,
      recoveries: 30,
      xgcPer90: 0.76,
      savesPer90: 0,
    });
    expect(row(1).savesPer90).toBe(2);
  });

  it("fill the transfers and price view, with prices in £m", () => {
    expect(row(12)).toMatchObject({
      transfersInEvent: 7,
      transfersOutEvent: 1230,
      netTransfersEvent: -1223,
      priceChangeEvent: 0,
      priceChangeStart: -0.1,
    });
    expect(row(1).priceChangeStart).toBe(0.3);
    expect(row(7).priceChangeStart).toBe(-0.2);
  });

  it("fill the minutes and bonus view", () => {
    expect(row(5)).toMatchObject({ minutes: 335, starts: 3 });
    expect(typeof row(5).bonus).toBe("number");
    expect(typeof row(5).bps).toBe("number");
  });

  it("carry availability on every row", () => {
    expect(row(12).availability).toMatchObject({ status: "injured", chance: 0 });
    expect(row(1).availability).toBeNull();
  });
});

describe("buildPlayerGameweeks", () => {
  it("turns each history row into a gameweek with price in £m", () => {
    expect(buildPlayerGameweeks(loadSummary(1))).toEqual([
      { gameweek: 1, points: 6, minutes: 90, goals: 0, assists: 0, xg: 0, xa: 0, bonus: 0, bps: 24, defensiveContribution: 0, price: 6, selected: 3347153, transfersBalance: 0 },
      { gameweek: 2, points: 6, minutes: 90, goals: 0, assists: 0, xg: 0, xa: 0, bonus: 0, bps: 21, defensiveContribution: 0, price: 6, selected: 3801300, transfersBalance: 24756 },
      { gameweek: 3, points: 3, minutes: 90, goals: 0, assists: 0, xg: 0, xa: 0.01, bonus: 0, bps: 15, defensiveContribution: 0, price: 6, selected: 3887669, transfersBalance: -23780 },
    ]);
    // Mount's price fell from £5.5m to £5.4m in GW3.
    expect(buildPlayerGameweeks(loadSummary(430)).map((g) => g.price)).toEqual([5.5, 5.5, 5.4]);
  });

  it("adds up a double gameweek's matches and takes price and ownership from the later one", () => {
    const summary = loadSummary(1);
    const [first, second] = summary.history;
    // Played out of order, so the later kickoff comes first in the list.
    summary.history = [
      { ...second, round: 1, total_points: 9, goals_scored: 1, assists: 1, bonus: 3, bps: 40, defensive_contribution: 4, expected_goals: "0.2", expected_assists: "0.7", value: 61, selected: 3400000, transfers_balance: 900 },
      { ...first, total_points: 2, bonus: 1, defensive_contribution: 6, expected_goals: "0.1", expected_assists: "0.2" },
      summary.history[2],
    ];

    const [dgw, ...rest] = buildPlayerGameweeks(summary);
    expect(dgw).toEqual({
      gameweek: 1,
      points: 11,
      minutes: 180,
      goals: 1,
      assists: 1,
      // 0.1 + 0.2 is 0.30000000000000004 in floating point.
      xg: 0.3,
      xa: 0.9,
      bonus: 4,
      bps: 64,
      defensiveContribution: 10,
      price: 6.1,
      selected: 3400000,
      transfersBalance: 900,
    });
    expect(rest.map((g) => g.gameweek)).toEqual([3]);
  });

  it("is empty for a player with no history or no summary", () => {
    expect(buildPlayerGameweeks({ history: [] })).toEqual([]);
    expect(buildPlayerGameweeks(undefined)).toEqual([]);
  });
});

describe("buildPlayerDetail", () => {
  it("adds availability, set pieces and derived stats for the player page", () => {
    const bootstrap = loadBootstrap();
    const detail = buildPlayerDetail(bootstrap, element(12), loadSummary(1));
    expect(detail.availability).toMatchObject({ status: "injured", chance: 0 });
    expect(detail.setPieces).toHaveLength(3);
    expect(detail.stats).toMatchObject({
      expected_goal_involvements: "4.83",
      defensive_contribution: 46,
      goalsMinusXg: -0.63,
      priceChangeStart: -0.1,
    });
    expect(detail.history).toHaveLength(3);
    expect(detail).not.toHaveProperty("status");
    expect(detail).not.toHaveProperty("news");
  });
});

describe("player names", () => {
  it("show FPL's short name in the table, with the full name kept for its tooltip", () => {
    expect(row(1)).toMatchObject({ name: "Raya", fullName: "David Raya Martín" });
    expect(row(5)).toMatchObject({ name: "J.Timber", fullName: "Jurriën Timber" });
    expect(row(4)).toMatchObject({ name: "Gabriel", fullName: "Gabriel dos Santos Magalhães" });
  });

  it("fall back to the full name when FPL sends no short name", () => {
    const bootstrap = loadBootstrap();
    bootstrap.elements[0].web_name = " ";
    expect(buildPlayerRows(bootstrap)[0]).toMatchObject({
      name: "David Raya Martín",
      fullName: "David Raya Martín",
    });
  });

  it("keep the full name on the player page", () => {
    expect(buildPlayerDetail(loadBootstrap(), element(1), loadSummary(1)).name).toBe("David Raya Martín");
  });
});

describe("matchesPlayerSearch", () => {
  const raya = { name: "Raya", fullName: "David Raya Martín" };
  const timber = { name: "J.Timber", fullName: "Jurriën Timber" };
  const bruno = { name: "B.Fernandes", fullName: "Bruno Borges Fernandes" };

  it("matches the short name, first name, second name and full name", () => {
    expect(matchesPlayerSearch(timber, "J.Timber")).toBe(true);
    expect(matchesPlayerSearch(timber, "Jurriën")).toBe(true);
    expect(matchesPlayerSearch(raya, "Raya Martín")).toBe(true);
    expect(matchesPlayerSearch(raya, "David Raya Martín")).toBe(true);
    expect(matchesPlayerSearch(bruno, "b.fern")).toBe(true);
  });

  it("ignores case, accents, extra spaces and word order", () => {
    expect(matchesPlayerSearch(raya, "  david   MARTIN ")).toBe(true);
    expect(matchesPlayerSearch(timber, "jurrien")).toBe(true);
    expect(matchesPlayerSearch(bruno, "bruno fernandes")).toBe(true);
    expect(matchesPlayerSearch(bruno, "fernandes bruno")).toBe(true);
  });

  it("folds letters that normalization keeps, like ø and ß", () => {
    expect(matchesPlayerSearch({ name: "Ødegaard", fullName: "Martin Ødegaard" }, "odegaard")).toBe(true);
    expect(matchesPlayerSearch({ name: "Groß", fullName: "Pascal Groß" }, "gross")).toBe(true);
    expect(foldForSearch("Łukasz Fabiański")).toBe("lukasz fabianski");
  });

  it("needs every word to match, and matches everyone on an empty query", () => {
    expect(matchesPlayerSearch(bruno, "bruno silva")).toBe(false);
    expect(matchesPlayerSearch(raya, "saka")).toBe(false);
    expect(matchesPlayerSearch(raya, "   ")).toBe(true);
  });
});

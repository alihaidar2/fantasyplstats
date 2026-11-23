import { beforeAll, describe, expect, it } from "vitest";
import type { Bootstrap, Element, Snapshot } from "../src/lib/fpl";
import {
  AVAILABILITY_GROUP_ORDER,
  buildAvailability,
  buildPriceChanges,
  buildSetPieces,
  buildTemplateTeam,
  buildValueRankings,
  hasSetPieceData,
  MAX_PER_CLUB,
  pickMaxWeightSquad,
  pickStartingXI,
  PLAYERS_HUB_PATHS,
  SEASON_LIST_LENGTH,
  SQUAD_QUOTAS,
  toMillions,
  TRANSFER_LIST_LENGTH,
  VALUE_LIST_LENGTH,
  valueMinutesThreshold,
} from "../src/lib/stats/players-hub";
import { buildFixtureSnapshot } from "./fixture-client";
import { loadBootstrap } from "./helpers";

// The CI fixture snapshot: 436 players, GW3 current (GW1–2 finished).
let snapshot: Snapshot;
beforeAll(async () => {
  snapshot = (await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"))).snapshot;
});

/** A bootstrap built from one recorded player with fields overridden. */
const template = loadBootstrap();
const baseElement = template.elements[0];
function el(overrides: Partial<Element> & Pick<Element, "id">): Element {
  return {
    ...baseElement,
    web_name: `P${overrides.id}`,
    first_name: "Player",
    second_name: String(overrides.id),
    status: "a",
    news: "",
    news_added: null,
    chance_of_playing_next_round: null,
    cost_change_event: 0,
    cost_change_start: 0,
    transfers_in_event: 0,
    transfers_out_event: 0,
    penalties_order: null,
    direct_freekicks_order: null,
    corners_and_indirect_freekicks_order: null,
    ...overrides,
  };
}
function bootstrapWith(elements: Element[], events: Bootstrap["events"] = template.events): Bootstrap {
  return { ...template, events, elements };
}
const owned = (percent: number) => percent.toFixed(1);

describe("paths", () => {
  it("are under /players/ and end with a slash", () => {
    for (const path of Object.values(PLAYERS_HUB_PATHS)) expect(path).toMatch(/^\/players\/[a-z-]+\/$/);
  });

  it("converts FPL's tenths to £m without floating-point noise", () => {
    expect(toMillions(53)).toBe(5.3);
    expect(toMillions(-3)).toBe(-0.3);
    expect(toMillions(1001)).toBe(100.1);
  });
});

describe("buildAvailability", () => {
  it("groups the fixture snapshot's flagged players by status, most-owned first", () => {
    const groups = buildAvailability(snapshot.bootstrap);
    expect(groups.map((g) => g.status)).toEqual(["injured", "doubtful", "suspended", "not-eligible"]);
    expect(groups.map((g) => g.players.length)).toEqual([23, 12, 4, 1]);
    for (const g of groups) {
      const ownership = g.players.map((p) => p.ownership);
      expect(ownership).toEqual([...ownership].sort((a, b) => b - a));
      for (const p of g.players) expect(p.availability?.status).toBe(g.status);
    }
    const saka = groups[0].players.find((p) => p.name === "Saka");
    expect(saka).toMatchObject({ team: "ARS", position: "MID", chance: 0, news: "Thigh injury - Expected back 20 Dec" });
  });

  it("keeps FPL's news date, and counts an available player below 100% as doubtful", () => {
    const groups = buildAvailability(
      bootstrapWith([
        el({ id: 1, status: "a", chance_of_playing_next_round: 75, news: "Knock", news_added: "2026-11-20T10:00:00Z", selected_by_percent: owned(2) }),
        el({ id: 2, status: "d", chance_of_playing_next_round: 50, news: "Ill", selected_by_percent: owned(9) }),
        el({ id: 3, status: "u", news: "Joined another club", selected_by_percent: owned(0.1) }),
        el({ id: 4, status: "a", selected_by_percent: owned(50) }),
        el({ id: 5, status: "i", news: "Knee", selected_by_percent: owned(1) }),
      ]),
    );
    expect(groups.map((g) => [g.status, g.players.map((p) => p.id)])).toEqual([
      ["injured", [5]],
      ["doubtful", [2, 1]],
      ["unavailable", [3]],
    ]);
    expect(groups[1].players[1]).toMatchObject({ chance: 75, newsAdded: "2026-11-20T10:00:00Z" });
    expect(groups[1].players[0].newsAdded).toBeNull();
  });

  it("reads news_added from FPL's response", () => {
    const flagged = buildAvailability(loadBootstrap()).flatMap((g) => g.players);
    expect(flagged.some((p) => p.newsAdded?.startsWith("2026-"))).toBe(true);
  });

  it("is empty when nobody is flagged, and orders groups as documented", () => {
    expect(buildAvailability(bootstrapWith([el({ id: 1 })]))).toEqual([]);
    expect(AVAILABILITY_GROUP_ORDER[0]).toBe("injured");
  });
});

describe("buildPriceChanges", () => {
  it("lists every change this gameweek, biggest first, ties to the more-owned player", () => {
    const prices = buildPriceChanges(
      bootstrapWith([
        el({ id: 1, cost_change_event: 1, selected_by_percent: owned(1) }),
        el({ id: 2, cost_change_event: 2, selected_by_percent: owned(0.5) }),
        el({ id: 3, cost_change_event: 1, selected_by_percent: owned(30) }),
        el({ id: 4, cost_change_event: -1, selected_by_percent: owned(3) }),
        el({ id: 5, cost_change_event: -2, selected_by_percent: owned(1) }),
        el({ id: 6, cost_change_event: 0 }),
      ]),
    );
    expect(prices.risers.map((r) => r.id)).toEqual([2, 3, 1]);
    expect(prices.fallers.map((r) => r.id)).toEqual([5, 4]);
    expect(prices.risers[0].changeEvent).toBe(0.2);
    expect(prices.fallers[0].changeEvent).toBe(-0.2);
  });

  it("works out the season's start price and net transfers", () => {
    const [row] = buildPriceChanges(
      bootstrapWith([
        el({ id: 1, now_cost: 83, cost_change_start: 8, transfers_in_event: 1200, transfers_out_event: 200 }),
      ]),
    ).seasonRisers;
    expect(row).toMatchObject({ price: 8.3, startPrice: 7.5, changeStart: 0.8, netTransfers: 1000 });
  });

  it("limits the season and transfer lists on the fixture snapshot", () => {
    const prices = buildPriceChanges(snapshot.bootstrap);
    expect(prices.risers).toHaveLength(6);
    expect(prices.fallers).toHaveLength(21);
    expect(prices.seasonRisers).toHaveLength(SEASON_LIST_LENGTH);
    expect(prices.seasonFallers).toHaveLength(SEASON_LIST_LENGTH);
    expect(prices.mostIn).toHaveLength(TRANSFER_LIST_LENGTH);
    expect(prices.seasonRisers[0]).toMatchObject({ name: "De Cuyper", changeStart: 1, startPrice: 4.5 });
    expect(prices.mostIn[0]).toMatchObject({ name: "Wirtz", netTransfers: 138600 });
    const net = prices.mostOut.map((r) => r.netTransfers);
    expect(net.every((n) => n < 0)).toBe(true);
    expect(net).toEqual([...net].sort((a, b) => a - b));
  });

  it("is empty before any change", () => {
    const prices = buildPriceChanges(bootstrapWith([el({ id: 1 })]));
    expect(Object.values(prices).every((list) => list.length === 0)).toBe(true);
  });
});

describe("buildValueRankings", () => {
  const finished = (count: number) =>
    template.events.map((e) => ({ ...e, finished: e.id <= count }));

  it("needs half the available minutes, and at least one full match", () => {
    expect(valueMinutesThreshold(0)).toBe(90);
    expect(valueMinutesThreshold(1)).toBe(90);
    expect(valueMinutesThreshold(10)).toBe(450);
    expect(valueMinutesThreshold(38)).toBe(1710);
  });

  it("ranks per £m by position and leaves out cameos, departed players and goalkeepers' xGI", () => {
    const rankings = buildValueRankings(
      bootstrapWith(
        [
          el({ id: 1, element_type: 3, now_cost: 50, total_points: 40, minutes: 450, expected_goal_involvements: "2.00", form: "5.0" }),
          el({ id: 2, element_type: 3, now_cost: 100, total_points: 60, minutes: 900, expected_goal_involvements: "5.00", form: "4.0" }),
          // A cameo: great per £m, too few minutes.
          el({ id: 3, element_type: 3, now_cost: 45, total_points: 30, minutes: 269, form: "12.0" }),
          // Left the club.
          el({ id: 4, element_type: 3, now_cost: 45, total_points: 90, minutes: 900, status: "u" }),
          el({ id: 5, element_type: 1, now_cost: 40, total_points: 30, minutes: 900, expected_goal_involvements: "0.10", form: "3.0" }),
        ],
        finished(6),
      ),
    );
    expect(rankings).toMatchObject({ minMinutes: 270, finishedGameweeks: 6 });
    const metric = (id: string) => rankings.metrics.find((m) => m.id === id)!;
    const ids = (id: string, positionId: number) =>
      metric(id).positions.find((p) => p.positionId === positionId)?.players.map((p) => p.id);

    expect(ids("points", 3)).toEqual([1, 2]);
    expect(metric("points").positions.find((p) => p.positionId === 3)!.players[0]).toMatchObject({ value: 8, base: 40 });
    expect(ids("xgi", 3)).toEqual([2, 1]);
    expect(ids("xgi", 1)).toBeUndefined();
    expect(ids("form", 3)).toEqual([1, 2]);
    expect(ids("points", 1)).toEqual([5]);
  });

  it("caps each list and sorts it on the fixture snapshot", () => {
    const rankings = buildValueRankings(snapshot.bootstrap);
    for (const m of rankings.metrics) {
      for (const p of m.positions) {
        expect(p.players.length).toBeLessThanOrEqual(VALUE_LIST_LENGTH);
        const values = p.players.map((r) => r.value);
        expect(values).toEqual([...values].sort((a, b) => b - a));
        for (const r of p.players) {
          expect(r.minutes).toBeGreaterThanOrEqual(rankings.minMinutes);
          expect(r.positionId).toBe(p.positionId);
        }
      }
    }
  });

  it("ranks nobody before the first gameweek", () => {
    const rankings = buildValueRankings(bootstrapWith([el({ id: 1, minutes: 0, total_points: 0 })], finished(0)));
    expect(rankings.metrics.every((m) => m.positions.every((p) => p.players.length === 0))).toBe(true);
  });
});

describe("buildSetPieces", () => {
  it("lists every club's takers in FPL's order", () => {
    const clubs = buildSetPieces(snapshot.bootstrap);
    expect(clubs).toHaveLength(20);
    expect(clubs.map((c) => c.name)).toEqual([...clubs.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
    const arsenal = clubs.find((c) => c.shortName === "ARS")!;
    const takers = (kind: string) => arsenal.duties.find((d) => d.kind === kind)!.takers.map((t) => `${t.order}:${t.name}`);
    expect(takers("penalties")).toEqual(["1:Saka", "2:Gyökeres", "3:Ødegaard", "4:Bruno G."]);
    expect(takers("corners")).toEqual(["1:Rice", "2:Saka", "3:Ødegaard"]);
    expect(hasSetPieceData(clubs)).toBe(true);
  });

  it("lists equal orders most-owned first, and reports when FPL has none", () => {
    const team = template.teams[0].id;
    const clubs = buildSetPieces(
      bootstrapWith([
        el({ id: 1, team, penalties_order: 1, selected_by_percent: owned(1) }),
        el({ id: 2, team, penalties_order: 1, selected_by_percent: owned(5) }),
        el({ id: 3, team, penalties_order: 2, selected_by_percent: owned(50) }),
      ]),
    );
    expect(clubs[0].duties[0].takers.map((t) => t.id)).toEqual([2, 1, 3]);
    expect(hasSetPieceData(buildSetPieces(bootstrapWith([el({ id: 1 })])))).toBe(false);
  });
});

describe("pickMaxWeightSquad", () => {
  const candidate = (id: number, team: number, element_type: number, weight: number) => ({
    element: el({ id, team, element_type }),
    weight,
  });

  it("beats greedy when a club's cap would block a better combination", () => {
    // Greedy takes A's goalkeeper (10), then only B's defender fits (1): 11.
    // The best is A's defender and B's goalkeeper: 17.
    const squad = pickMaxWeightSquad(
      [candidate(1, 1, 1, 10), candidate(2, 1, 2, 9), candidate(3, 2, 1, 8), candidate(4, 2, 2, 1)],
      { 1: 1, 2: 1 },
      1,
    );
    expect(squad?.map((e) => e.id).sort()).toEqual([2, 3]);
  });

  it("matches brute force on random small cases", () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const quotas = { 1: 1, 2: 2, 3: 2, 4: 1 };
    for (let round = 0; round < 25; round++) {
      const candidates = Array.from({ length: 13 }, (_, i) =>
        candidate(i + 1, 1 + Math.floor(random() * 3), 1 + Math.floor(random() * 4), 1 + Math.floor(random() * 100)),
      );
      let best = -1;
      const choose = (start: number, picked: typeof candidates) => {
        if (picked.length === 6) {
          const byPosition = new Map<number, number>();
          const byClub = new Map<number, number>();
          for (const c of picked) {
            byPosition.set(c.element.element_type, (byPosition.get(c.element.element_type) ?? 0) + 1);
            byClub.set(c.element.team, (byClub.get(c.element.team) ?? 0) + 1);
          }
          const valid =
            Object.entries(quotas).every(([p, q]) => (byPosition.get(Number(p)) ?? 0) === q) &&
            [...byClub.values()].every((n) => n <= 2);
          if (valid) best = Math.max(best, picked.reduce((s, c) => s + c.weight, 0));
          return;
        }
        for (let i = start; i < candidates.length; i++) choose(i + 1, [...picked, candidates[i]]);
      };
      choose(0, []);

      const squad = pickMaxWeightSquad(candidates, quotas, 2);
      if (best < 0) {
        expect(squad).toBeNull();
      } else {
        const weight = new Map(candidates.map((c) => [c.element.id, c.weight]));
        expect(squad!.reduce((s, e) => s + weight.get(e.id)!, 0)).toBe(best);
      }
    }
  });

  it("returns null when no valid squad exists", () => {
    expect(pickMaxWeightSquad([candidate(1, 1, 1, 5)], { 1: 2 }, 3)).toBeNull();
  });
});

describe("pickStartingXI", () => {
  it("fills the formation minimums, then the most-owned, with the bench goalkeeper first", () => {
    // Sorted most-owned first: 2 GK, 5 DEF, 5 MID, 3 FWD. The DEFs are the
    // least owned, so only the minimum 3 start.
    const squad = [
      el({ id: 1, element_type: 4 }),
      el({ id: 2, element_type: 3 }),
      el({ id: 3, element_type: 1 }),
      el({ id: 4, element_type: 3 }),
      el({ id: 5, element_type: 4 }),
      el({ id: 6, element_type: 3 }),
      el({ id: 7, element_type: 3 }),
      el({ id: 8, element_type: 4 }),
      el({ id: 9, element_type: 3 }),
      el({ id: 10, element_type: 1 }),
      el({ id: 11, element_type: 2 }),
      el({ id: 12, element_type: 2 }),
      el({ id: 13, element_type: 2 }),
      el({ id: 14, element_type: 2 }),
      el({ id: 15, element_type: 2 }),
    ];
    const { starting, bench } = pickStartingXI(squad);
    expect(starting.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13]);
    expect(bench.map((e) => e.id)).toEqual([10, 9, 14, 15]);
  });
});

describe("buildTemplateTeam", () => {
  it("builds a valid, most-owned squad and XI from the fixture snapshot", () => {
    const team = buildTemplateTeam(snapshot.bootstrap)!;
    const xi = team.lines.flatMap((l) => l.players);
    const squad = [...xi, ...team.bench];
    expect(xi).toHaveLength(11);
    expect(squad).toHaveLength(15);
    expect(new Set(squad.map((p) => p.id)).size).toBe(15);

    for (const [position, quota] of Object.entries(SQUAD_QUOTAS)) {
      expect(squad.filter((p) => p.positionId === Number(position))).toHaveLength(quota);
    }
    const perClub = new Map<number, number>();
    for (const p of squad) perClub.set(p.teamId, (perClub.get(p.teamId) ?? 0) + 1);
    expect(Math.max(...perClub.values())).toBeLessThanOrEqual(MAX_PER_CLUB);

    const [gk, def, mid, fwd] = team.lines.map((l) => l.players.length);
    expect(gk).toBe(1);
    expect(def).toBeGreaterThanOrEqual(3);
    expect(mid).toBeGreaterThanOrEqual(2);
    expect(fwd).toBeGreaterThanOrEqual(1);
    expect(team.formation).toBe(`${def}-${mid}-${fwd}`);
    expect(team.bench[0].positionId).toBe(1);

    // The most-owned player of all is in the XI.
    const top = [...snapshot.bootstrap.elements].sort((a, b) => Number(b.selected_by_percent) - Number(a.selected_by_percent))[0];
    expect(xi.map((p) => p.id)).toContain(top.id);

    const cost = (players: typeof squad) => Math.round(players.reduce((s, p) => s + p.price * 10, 0)) / 10;
    expect(team.squadCost).toBe(cost(squad));
    expect(team.startingCost).toBe(cost(xi));
    expect(team.captain).toEqual({ id: 411, gameweek: 3 });
  });

  it("takes each position's most-owned players when no club cap binds", () => {
    const elements: Element[] = [];
    let id = 1;
    for (const [position, quota] of Object.entries(SQUAD_QUOTAS)) {
      for (let i = 0; i < quota + 2; i++) {
        elements.push(
          el({ id, team: 1 + (id % 20), element_type: Number(position), selected_by_percent: owned(50 - id), now_cost: 50 }),
        );
        id++;
      }
    }
    const team = buildTemplateTeam(bootstrapWith(elements))!;
    const squad = [...team.lines.flatMap((l) => l.players), ...team.bench].map((p) => p.id).sort((a, b) => a - b);
    expect(squad).toEqual([1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21]);
    expect(team.squadCost).toBe(75);
    expect(team.captain).toBeNull();
  });

  it("is null when nobody is owned or a squad can't be filled", () => {
    expect(buildTemplateTeam(bootstrapWith([el({ id: 1, selected_by_percent: "0.0" })]))).toBeNull();
    expect(buildTemplateTeam(bootstrapWith([el({ id: 1, selected_by_percent: owned(5) })]))).toBeNull();
  });
});

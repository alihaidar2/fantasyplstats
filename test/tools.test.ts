import { beforeAll, describe, expect, it } from "vitest";
import { matchesPlayerSearch, type Availability, type Snapshot } from "../src/lib/fpl";
import {
  activeStarters,
  addBlockReason,
  addPlayer,
  benchPlayer,
  BUDGET,
  bestIndexes,
  canAddStarter,
  canCompleteFormation,
  canSwap,
  cancelTransfer,
  checkSquad,
  clearReplacement,
  compareRows,
  COMPARE_METRICS,
  decodeCompareIds,
  decodePlannerState,
  decodeToolsData,
  defaultStarters,
  DEFAULT_FILTER,
  EMPTY_STATE,
  encodeCompareIds,
  encodePlannerState,
  filterPlayers,
  fixtureOutlook,
  formatTenths,
  formationLabel,
  isValidFormation,
  keepTransfers,
  parseMillions,
  parseBank,
  isOtherSeason,
  linkSeason,
  MAX_BANK,
  per90,
  pointsPerMillion,
  positionCounts,
  removePlayer,
  resultingSquad,
  setCaptain,
  setVice,
  squadCost,
  startPlayer,
  startSquadMode,
  startTransfers,
  swapPlayers,
  transferHitCost,
  transferOut,
  transferSummary,
  VALID_FORMATIONS,
  type PlannerState,
  type PositionCounts,
  type PositionId,
  type ToolPlayer,
  type ToolsData,
  type ToolTeam,
} from "../src/lib/stats/tools";
import { buildToolsData, upcomingGameweeks } from "../src/lib/stats/tools-data";
import { buildFixtureSnapshot } from "./fixture-client";

// ─── A hand-built player pool ───────────────────────────────────────────────
//
// Ids encode the position: 1xx goalkeepers, 2xx defenders, 3xx midfielders,
// 4xx forwards. Teams 1–20 with short names T1..T20.

function player(
  id: number,
  position: PositionId,
  teamId: number,
  price: number,
  extra: Partial<ToolPlayer> = {},
): ToolPlayer {
  return {
    id,
    name: `P${id}`,
    fullName: `Player ${id}`,
    teamId,
    team: `T${teamId}`,
    position,
    price,
    points: 0,
    form: 0,
    selected: 0,
    minutes: 0,
    starts: 0,
    goals: 0,
    assists: 0,
    xg: 0,
    xa: 0,
    xgi: 0,
    bonus: 0,
    defensiveContribution: 0,
    cleanSheets: 0,
    saves: 0,
    availability: null,
    ...extra,
  };
}

const POOL: ToolPlayer[] = [
  ...[1, 2, 3, 4].map((n) => player(100 + n, 1, n, 45)),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => player(200 + n, 2, n + 4, 50)),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => player(300 + n, 3, n + 10, 70)),
  ...[1, 2, 3, 4, 5].map((n) => player(400 + n, 4, n + 15, 75)),
];
const BY_ID = new Map(POOL.map((p) => [p.id, p]));

/** A legal 15: 2 GK, 5 DEF, 5 MID, 3 FWD, 15 different clubs, £94.5m. */
const FULL_SQUAD = [101, 102, 201, 202, 203, 204, 205, 301, 302, 303, 304, 305, 401, 402, 403];

function build(ids: readonly number[] = FULL_SQUAD): PlannerState {
  return ids.reduce((s, id) => addPlayer(s, id, BY_ID), { ...EMPTY_STATE });
}

/** A full squad in a 4-4-2 with a captain and vice. */
function ready(): PlannerState {
  const s = build();
  return { ...s, starters: defaultStarters(s.squad, BY_ID), captain: 301, vice: 401 };
}

const counts = (gk: number, def: number, mid: number, fwd: number): PositionCounts => ({
  1: gk,
  2: def,
  3: mid,
  4: fwd,
});
const codes = (s: PlannerState, lookup = BY_ID) => checkSquad(s, lookup).issues.map((i) => i.code);

// ─── Formations ─────────────────────────────────────────────────────────────

describe("formations", () => {
  it("lists FPL's eight formations", () => {
    expect([...VALID_FORMATIONS].sort()).toEqual(
      ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-2-3", "5-3-2", "5-4-1"].sort(),
    );
  });

  it("accepts every valid XI and rejects the rest", () => {
    for (let gk = 0; gk <= 2; gk++)
      for (let d = 0; d <= 5; d++)
        for (let m = 0; m <= 5; m++)
          for (let f = 0; f <= 3; f++) {
            const c = counts(gk, d, m, f);
            const expected = gk === 1 && VALID_FORMATIONS.includes(`${d}-${m}-${f}`);
            expect(isValidFormation(c), formationLabel(c)).toBe(expected);
          }
  });

  it("rejects the classic mistakes", () => {
    expect(isValidFormation(counts(1, 2, 5, 3))).toBe(false); // two defenders
    expect(isValidFormation(counts(1, 5, 5, 0))).toBe(false); // no forward
    expect(isValidFormation(counts(2, 4, 3, 2))).toBe(false); // two goalkeepers
    expect(isValidFormation(counts(1, 4, 4, 1))).toBe(false); // ten players
    expect(isValidFormation(counts(1, 4, 4, 3))).toBe(false); // twelve players
  });

  it("knows when a partial XI can still be completed", () => {
    expect(canCompleteFormation(counts(0, 0, 0, 0))).toBe(true);
    expect(canCompleteFormation(counts(1, 5, 4, 0))).toBe(true); // one place left, for a forward
    expect(canCompleteFormation(counts(1, 5, 5, 0))).toBe(false); // full, no forward
    expect(canCompleteFormation(counts(0, 5, 4, 1))).toBe(true); // the goalkeeper's place is left
    expect(canCompleteFormation(counts(0, 5, 5, 1))).toBe(false); // full, no goalkeeper
    expect(canCompleteFormation(counts(0, 5, 5, 0))).toBe(false); // one place, two needs
    expect(canCompleteFormation(counts(2, 0, 0, 0))).toBe(false);
    expect(canCompleteFormation(counts(1, 6, 0, 0))).toBe(false);
  });

  it("only lets a starter in when the XI stays completable", () => {
    expect(canAddStarter(counts(1, 5, 4, 0), 3)).toBe(false); // would leave no place for a forward
    expect(canAddStarter(counts(1, 5, 4, 0), 4)).toBe(true);
    expect(canAddStarter(counts(1, 3, 2, 1), 1)).toBe(false); // second goalkeeper
    expect(canAddStarter(counts(0, 0, 0, 3), 4)).toBe(false); // fourth forward
  });

  it("checks swaps by position", () => {
    const c442 = counts(1, 4, 4, 2);
    expect(canSwap(c442, 3, 4)).toBe(true); // 4-3-3
    expect(canSwap(c442, 4, 3)).toBe(true); // 4-5-1
    expect(canSwap(counts(1, 4, 5, 1), 4, 3)).toBe(false); // would leave no forward
    expect(canSwap(counts(1, 3, 5, 2), 2, 3)).toBe(false); // two defenders
    expect(canSwap(c442, 1, 1)).toBe(true); // goalkeeper for goalkeeper
    expect(canSwap(c442, 1, 2)).toBe(false); // no goalkeeper
  });

  it("picks a 4-4-2 by default for a full squad", () => {
    const xi = defaultStarters(FULL_SQUAD, BY_ID);
    expect(xi).toHaveLength(11);
    expect(formationLabel(positionCounts(xi, BY_ID))).toBe("4-4-2");
    expect(xi).not.toContain(102);
  });

  it("fills a partial XI with whoever fits", () => {
    // No forwards yet: start everyone, keeping a place for one forward.
    const xi = defaultStarters([101, 201, 202, 203, 301, 302, 303, 304, 305], BY_ID);
    expect(positionCounts(xi, BY_ID)).toEqual(counts(1, 3, 5, 0));
    expect(canCompleteFormation(positionCounts(xi, BY_ID))).toBe(true);
  });
});

// ─── Building a squad ───────────────────────────────────────────────────────

describe("building a squad", () => {
  it("adds players and starts them while the XI has room", () => {
    const s = build();
    expect(s.squad).toEqual(FULL_SQUAD);
    expect(s.starters).toHaveLength(11);
    expect(isValidFormation(positionCounts(s.starters, BY_ID))).toBe(true);
    // In pick order: GK, five defenders, four midfielders, then a forward (5-4-1).
    expect(formationLabel(positionCounts(s.starters, BY_ID))).toBe("5-4-1");
  });

  it("blocks a sixth defender, a third goalkeeper and the same player twice", () => {
    const s = build();
    expect(addBlockReason(s, 206, BY_ID)).toBe("You have 5 defenders");
    expect(addBlockReason(s, 103, BY_ID)).toBe("You have 2 goalkeepers");
    expect(addBlockReason(build([201]), 201, BY_ID)).toBe("In your squad");
    expect(addPlayer(s, 206, BY_ID)).toBe(s);
  });

  it("blocks a fourth player from one club", () => {
    const lookup = new Map(BY_ID);
    // Three defenders from team 5, plus one more on offer.
    for (const id of [202, 203, 206]) lookup.set(id, { ...BY_ID.get(id)!, teamId: 5, team: "T5" });
    const s = [201, 202, 203].reduce((st, id) => addPlayer(st, id, lookup), { ...EMPTY_STATE });
    expect(addBlockReason(s, 206, lookup)).toBe("3 T5 players already");
    // A player from another club is fine.
    expect(addBlockReason(s, 204, lookup)).toBeNull();
  });

  it("removes a player with his place in the XI and his armband", () => {
    const s = removePlayer(ready(), 301);
    expect(s.squad).not.toContain(301);
    expect(s.starters).not.toContain(301);
    expect(s.captain).toBeNull();
    expect(s.vice).toBe(401);
  });

  it("costs the squad in tenths, exactly", () => {
    expect(squadCost(FULL_SQUAD, BY_ID)).toBe(2 * 45 + 5 * 50 + 5 * 70 + 3 * 75);
    expect(squadCost([], BY_ID)).toBe(0);
    expect(formatTenths(squadCost(FULL_SQUAD, BY_ID))).toBe("£91.5m");
  });
});

describe("starting XI and armband", () => {
  it("benches and starts players within the rules", () => {
    let s = ready(); // 4-4-2, bench 102, 205, 305, 403
    expect(startPlayer(s, 205, BY_ID)).toBe(s); // XI is full
    s = benchPlayer(s, 402);
    expect(s.starters).toHaveLength(10);
    expect(startPlayer(s, 102, BY_ID)).toBe(s); // a second goalkeeper
    s = startPlayer(s, 305, BY_ID);
    expect(formationLabel(positionCounts(s.starters, BY_ID))).toBe("4-5-1");
  });

  it("swaps a starter for a bench player only when the formation stays valid", () => {
    const s = ready();
    const swapped = swapPlayers(s, 402, 305, BY_ID);
    expect(formationLabel(positionCounts(swapped.starters, BY_ID))).toBe("4-5-1");
    // From 4-5-1, the last forward can't make way for a defender.
    expect(swapPlayers(swapped, 401, 205, BY_ID)).toBe(swapped);
    // Goalkeeper for goalkeeper.
    expect(swapPlayers(s, 101, 102, BY_ID).starters).toContain(102);
    // Not a goalkeeper for an outfield player.
    expect(swapPlayers(s, 101, 205, BY_ID)).toBe(s);
  });

  it("drops the armband of a starter who is benched or swapped out", () => {
    const s = ready();
    expect(benchPlayer(s, 301).captain).toBeNull();
    expect(swapPlayers(s, 401, 403, BY_ID).vice).toBeNull();
  });

  it("only gives the armband to starters and swaps the roles when needed", () => {
    const s = ready();
    expect(setCaptain(s, 102)).toBe(s); // on the bench
    const swapped = setCaptain(s, 401); // the vice becomes captain
    expect([swapped.captain, swapped.vice]).toEqual([401, 301]);
    expect(setCaptain(s, 301).captain).toBeNull(); // toggles off
    const v = setVice(s, 301);
    expect([v.captain, v.vice]).toEqual([401, 301]);
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe("checkSquad", () => {
  it("passes a complete, legal squad", () => {
    const check = checkSquad(ready(), BY_ID);
    expect(check.issues).toEqual([]);
    expect(check.complete).toBe(true);
    expect(check.remaining).toBe(BUDGET - 915);
    expect(check.cost).toBe(915);
  });

  it("starts empty with nothing to do but pick", () => {
    const check = checkSquad(EMPTY_STATE, BY_ID);
    expect(check.issues.map((i) => i.code)).toEqual(["squad-size"]);
    expect(check.issues[0].message).toBe("Pick 15 more players (2 GKP, 5 DEF, 5 MID, 3 FWD).");
    expect(check.remaining).toBe(BUDGET);
    expect(check.complete).toBe(false);
  });

  it("asks for the missing players by position", () => {
    const check = checkSquad(build(FULL_SQUAD.slice(0, 14)), BY_ID);
    expect(check.issues[0].message).toBe("Pick 1 more player (1 FWD).");
  });

  it("flags going over £100.0m by how much", () => {
    const lookup = new Map(BY_ID);
    lookup.set(401, { ...BY_ID.get(401)!, price: 160 });
    lookup.set(402, { ...BY_ID.get(402)!, price: 150 }); // 91.5 + 8.5 + 7.5 = £107.5m
    const check = checkSquad(ready(), lookup);
    expect(check.remaining).toBe(-75);
    expect(check.issues.find((i) => i.code === "budget")?.message).toBe("Over budget by £7.5m.");
    expect(check.complete).toBe(false);
  });

  it("is fine at exactly £100.0m", () => {
    const lookup = new Map(BY_ID);
    lookup.set(401, { ...BY_ID.get(401)!, price: 160 }); // 91.5 + 8.5 = £100.0m
    const check = checkSquad(ready(), lookup);
    expect(check.remaining).toBe(0);
    expect(check.issues).toEqual([]);
  });

  it("flags more than 3 players from a club (from a tampered link, say)", () => {
    const lookup = new Map(BY_ID);
    // Team 3 has no one else in the squad.
    for (const id of [201, 202, 203, 204]) lookup.set(id, { ...BY_ID.get(id)!, teamId: 3, team: "T3" });
    const issue = checkSquad(ready(), lookup).issues.find((i) => i.code === "club-limit");
    expect(issue?.message).toBe("4 players from T3: the limit is 3 per club.");
  });

  it("flags too many of a position", () => {
    const s: PlannerState = { ...ready(), squad: [...FULL_SQUAD, 206] };
    expect(codes(s)).toContain("position-count");
  });

  it("flags a short XI, an invalid formation and a missing armband", () => {
    let s = benchPlayer(ready(), 402);
    expect(codes(s)).toEqual(["xi-size"]);
    // 1-5-5-0: full but no forward.
    s = { ...ready(), starters: [101, 201, 202, 203, 204, 205, 301, 302, 303, 304, 305], captain: 301, vice: 302 };
    const check = checkSquad(s, BY_ID);
    expect(check.issues.map((i) => i.code)).toEqual(["formation"]);
    expect(check.issues[0].message).toContain("at least 1 FWD");
    s = { ...ready(), captain: null, vice: null };
    expect(codes(s)).toEqual(["captain", "vice"]);
  });

  it("warns, without blocking, about injured or doubtful starters", () => {
    const injured: Availability = { status: "injured", chance: 0, news: "Hamstring injury" };
    const doubtful: Availability = { status: "doubtful", chance: 75, news: "Knock - 75% chance of playing" };
    const lookup = new Map(BY_ID);
    lookup.set(301, { ...BY_ID.get(301)!, availability: injured });
    lookup.set(302, { ...BY_ID.get(302)!, availability: doubtful });
    lookup.set(102, { ...BY_ID.get(102)!, availability: injured }); // on the bench: no warning
    const check = checkSquad(ready(), lookup);
    expect(check.issues.map((i) => i.message)).toEqual([
      "P301 (T11) is in your XI: injured, 0% chance of playing.",
      "P302 (T12) is in your XI: doubtful, 75% chance of playing.",
    ]);
    expect(check.issues.every((i) => i.severity === "warning")).toBe(true);
    expect(check.complete).toBe(true);
  });
});

// ─── Transfers ──────────────────────────────────────────────────────────────

describe("transfer costs", () => {
  it("charges 4 points for each transfer beyond the free ones", () => {
    expect(transferHitCost(0, 1)).toBe(0);
    expect(transferHitCost(1, 1)).toBe(0);
    expect(transferHitCost(2, 1)).toBe(4);
    expect(transferHitCost(3, 1)).toBe(8);
    expect(transferHitCost(3, 0)).toBe(12);
    expect(transferHitCost(5, 5)).toBe(0);
    expect(transferHitCost(6, 5)).toBe(4);
    expect(transferHitCost(2, -1)).toBe(8);
  });

  it("makes every transfer free on a wildcard or free hit", () => {
    expect(transferHitCost(10, 1, "wildcard")).toBe(0);
    expect(transferHitCost(10, 0, "freehit")).toBe(0);
  });
});

describe("planning transfers", () => {
  const transfersMode = () => startTransfers(ready(), BY_ID);

  it("starts with the money left from £100.0m in the bank", () => {
    const s = transfersMode();
    expect(s.mode).toBe("transfers");
    expect(s.bank).toBe(85);
    expect(transferSummary(s, BY_ID)).toMatchObject({ made: 0, open: 0, hitCost: 0, bankAfter: 85 });
  });

  it("replaces a player out with one of the same position, in his XI place", () => {
    let s = transferOut(transfersMode(), 301); // the captain, a starter
    expect(s.captain).toBeNull();
    expect(resultingSquad(s)).not.toContain(301);
    expect(activeStarters(s)).toHaveLength(10);
    expect(codes(s)).toContain("open-transfer");
    // A defender can't replace a midfielder, and a squad player can't come in.
    expect(addBlockReason(s, 206, BY_ID)).toBe("Transfer a DEF out first");
    expect(addBlockReason(s, 302, BY_ID)).toBe("In your squad");
    expect(addBlockReason(s, 301, BY_ID)).toBe("Transferred out");
    s = addPlayer(s, 306, BY_ID);
    expect(s.transfers).toEqual([{ out: 301, in: 306 }]);
    expect(s.starters).toContain(306);
    expect(activeStarters(s)).toHaveLength(11);
    expect(resultingSquad(s)).toHaveLength(15);
  });

  it("keeps a bench player's replacement on the bench", () => {
    const s = addPlayer(transferOut(transfersMode(), 305), 306, BY_ID);
    expect(s.starters).not.toContain(306);
  });

  it("adds up the budget and the hits", () => {
    const lookup = new Map(BY_ID);
    lookup.set(306, { ...BY_ID.get(306)!, price: 100 }); // £10.0m for a £7.0m player
    let s = startTransfers(ready(), lookup);
    s = addPlayer(transferOut(s, 301), 306, lookup);
    s = addPlayer(transferOut(s, 201), 206, lookup); // £5.0m for £5.0m
    s = transferOut(s, 401); // open
    const summary = transferSummary(s, lookup);
    expect(summary).toEqual({ made: 2, open: 1, extra: 1, hitCost: 4, sold: 120, bought: 150, bankAfter: 55 });
    expect(checkSquad(s, lookup).remaining).toBe(55);

    expect(transferSummary({ ...s, freeTransfers: 2 }, lookup).hitCost).toBe(0);
    expect(transferSummary({ ...s, chip: "wildcard" }, lookup).hitCost).toBe(0);
  });

  it("flags transfers that overspend the bank", () => {
    const lookup = new Map(BY_ID);
    lookup.set(406, player(406, 4, 3, 170)); // £17.0m for a £7.5m forward, £8.5m in the bank
    const s = addPlayer(transferOut(startTransfers(ready(), lookup), 401), 406, lookup);
    expect(transferSummary(s, lookup).bankAfter).toBe(-10);
    expect(checkSquad(s, lookup).issues.find((i) => i.code === "budget")?.message).toBe("Over budget by £1.0m.");
  });

  it("checks the club limit after the players out have left", () => {
    const lookup = new Map(BY_ID);
    // Clubs: 201 and 202 play for team 5, as does the defender on offer.
    for (const id of [202, 206]) lookup.set(id, { ...BY_ID.get(id)!, teamId: 5, team: "T5" });
    lookup.set(207, { ...BY_ID.get(207)!, teamId: 5, team: "T5" });
    let s = startTransfers(ready(), lookup);
    s = addPlayer(transferOut(s, 203), 206, lookup); // a third T5 player: fine
    expect(s.transfers[0].in).toBe(206);
    s = transferOut(s, 204);
    expect(addBlockReason(s, 207, lookup)).toBe("3 T5 players already");
    // Selling one of the three makes room.
    s = transferOut(s, 201);
    expect(addBlockReason(s, 207, lookup)).toBeNull();
  });

  it("cancels a transfer, bringing the player back to his place", () => {
    let s = addPlayer(transferOut(transfersMode(), 301), 306, BY_ID);
    s = setCaptain(s, 306);
    s = cancelTransfer(s, 301);
    expect(s.transfers).toEqual([]);
    expect(s.starters).toContain(301);
    expect(s.starters).not.toContain(306);
    expect(s.captain).toBeNull();
  });

  it("clears a replacement, leaving the transfer open", () => {
    let s = addPlayer(transferOut(transfersMode(), 301), 306, BY_ID);
    s = clearReplacement(s, 301);
    expect(s.transfers).toEqual([{ out: 301, in: null }]);
    expect(activeStarters(s)).not.toContain(301);
    s = addPlayer(s, 307, BY_ID);
    expect(activeStarters(s)).toContain(307);
  });

  it("keeps the transfers like confirming them in FPL", () => {
    let s = addPlayer(transferOut(transfersMode(), 301), 306, BY_ID);
    s = addPlayer(transferOut(s, 302), 307, BY_ID);
    s = transferOut(s, 401); // open: dropped, 401 stays
    s = { ...s, freeTransfers: 1 };
    const kept = keepTransfers(s, BY_ID);
    expect(kept.transfers).toEqual([]);
    expect(kept.squad).toEqual(FULL_SQUAD.map((id) => (id === 301 ? 306 : id === 302 ? 307 : id)));
    expect(kept.starters).toHaveLength(11);
    expect(kept.starters).toContain(401);
    expect(kept.freeTransfers).toBe(0);
    expect(kept.bank).toBe(85);
  });

  it("only goes back to building once the transfers are kept or reset", () => {
    const s = transferOut(transfersMode(), 301);
    expect(startSquadMode(s)).toBe(s);
    expect(startSquadMode(cancelTransfer(s, 301)).mode).toBe("squad");
  });
});

// ─── URL state ──────────────────────────────────────────────────────────────

describe("planner links", () => {
  it("round-trips a squad with its XI and armband", () => {
    const s = swapPlayers(ready(), 402, 305, BY_ID); // 4-5-1
    const search = encodePlannerState(s);
    expect(search).toBe(
      "squad=101.102.201.202.203.204.205.301.302.303.304.305.401.402.403&bench=102.205.402.403&c=301&vc=401",
    );
    const { state, dropped } = decodePlannerState(search, BY_ID);
    expect(dropped).toBe(0);
    expect(state.squad).toEqual(s.squad);
    expect([...state.starters].sort()).toEqual([...s.starters].sort());
    expect([state.captain, state.vice]).toEqual([301, 401]);
    expect(state.mode).toBe("squad");
  });

  it("round-trips transfers, including an open one", () => {
    let s = startTransfers(ready(), BY_ID);
    s = addPlayer(transferOut(s, 301), 306, BY_ID);
    s = transferOut(s, 305); // a bench player, open
    s = { ...s, freeTransfers: 2, chip: "wildcard" };
    const search = encodePlannerState(s);
    expect(search).toContain("mode=transfers&out=301.305&in=306.0&ft=2&bank=85&chip=wc");
    const { state } = decodePlannerState(search, BY_ID);
    expect(state.transfers).toEqual(s.transfers);
    expect(state.starters.sort()).toEqual([...s.starters].sort());
    // 305 was on the bench, so the XI is still full.
    expect(activeStarters(state)).toHaveLength(11);
    expect(resultingSquad(state)).toHaveLength(14);
    expect([state.bank, state.freeTransfers, state.chip]).toEqual([85, 2, "wildcard"]);
  });

  it("keeps an open starter's XI place for his replacement", () => {
    const s = transferOut(startTransfers(ready(), BY_ID), 302);
    const { state } = decodePlannerState(encodePlannerState(s), BY_ID);
    expect(state.starters).toContain(302);
    expect(activeStarters(state)).toHaveLength(10);
    expect(addPlayer(state, 306, BY_ID).starters).toContain(306);
  });

  it("encodes an empty squad as nothing", () => {
    expect(encodePlannerState(EMPTY_STATE)).toBe("");
    expect(decodePlannerState("", BY_ID).state).toEqual(EMPTY_STATE);
  });

  it("drops what it can't trust", () => {
    const { state, dropped } = decodePlannerState(
      // unknown 999, duplicate 201, third goalkeeper 103, junk "x"
      "squad=101.102.103.201.201.999.x.301&c=999&vc=301",
      BY_ID,
    );
    expect(state.squad).toEqual([101, 102, 201, 301]);
    expect(dropped).toBe(3);
    expect(state.captain).toBeNull();
    expect(state.vice).toBe(301);
  });

  it("picks a default XI without a bench, or when the bench makes an impossible XI", () => {
    const squad = FULL_SQUAD.join(".");
    expect(decodePlannerState(`squad=${squad}`, BY_ID).state.starters).toEqual(defaultStarters(FULL_SQUAD, BY_ID));
    // A bench of the 4 forwards and midfielders would start both goalkeepers.
    const bad = decodePlannerState(`squad=${squad}&bench=401.402.403.305`, BY_ID).state;
    expect(isValidFormation(positionCounts(bad.starters, BY_ID))).toBe(true);
  });

  it("drops transfers that don't fit the squad", () => {
    const squad = FULL_SQUAD.join(".");
    const { state, dropped } = decodePlannerState(
      // 999 isn't in the squad; 206 (DEF) can't replace 301 (MID); 302's replacement is already in the squad.
      `squad=${squad}&mode=transfers&out=999.301.302&in=306.206.303&ft=9&bank=-5`,
      BY_ID,
    );
    expect(state.transfers).toEqual([
      { out: 301, in: null },
      { out: 302, in: null },
    ]);
    expect(dropped).toBe(3);
    expect(state.freeTransfers).toBe(1);
    expect(state.bank).toBe(0);
  });

  it("ignores transfer parameters in squad mode", () => {
    const { state } = decodePlannerState(`squad=101&out=101&in=102&chip=fh&bank=50`, BY_ID);
    expect(state).toMatchObject({ mode: "squad", transfers: [], chip: "none", bank: 0 });
  });
});

// ─── Prices and filters ─────────────────────────────────────────────────────

describe("prices", () => {
  it("formats and parses tenths", () => {
    expect(formatTenths(55)).toBe("£5.5m");
    expect(formatTenths(1000)).toBe("£100.0m");
    expect(formatTenths(-3)).toBe("-£0.3m");
    expect(parseMillions("5.5")).toBe(55);
    expect(parseMillions("£0.3m")).toBe(3);
    expect(parseMillions("12")).toBe(120);
    expect(parseMillions("1.25")).toBeNull();
    expect(parseMillions("-1")).toBeNull();
    expect(parseMillions("")).toBeNull();
    // The bank input stops where a link's `bank` does: £100.0m.
    expect(parseBank("100.0")).toBe(MAX_BANK);
    expect(parseBank("100.1")).toBeNull();
    expect(parseBank("999.9")).toBeNull();
    expect(decodePlannerState(`squad=101&mode=transfers&bank=${MAX_BANK}`, BY_ID).state.bank).toBe(MAX_BANK);
    expect(decodePlannerState(`squad=101&mode=transfers&bank=${MAX_BANK + 1}`, BY_ID).state.bank).toBe(0);
  });
});

describe("filterPlayers", () => {
  const pool = [
    player(1, 3, 1, 100, { name: "Saka", fullName: "Bukayo Saka", points: 50, form: 5 }),
    player(2, 3, 2, 125, { name: "Salah", fullName: "Mohamed Salah", points: 80, form: 8 }),
    player(3, 2, 1, 60, { name: "Gabriel", fullName: "Gabriel dos Santos Magalhães", points: 50, form: 9 }),
    player(4, 4, 3, 80, { name: "Wood", fullName: "Chris Wood", points: 40, form: 3 }),
  ];
  const run = (f: Partial<typeof DEFAULT_FILTER>) =>
    filterPlayers(pool, { ...DEFAULT_FILTER, ...f }, matchesPlayerSearch).map((p) => p.id);

  it("sorts by points by default, then by id", () => {
    expect(run({})).toEqual([2, 1, 3, 4]);
  });

  it("filters by position, team, price and name, accents ignored", () => {
    expect(run({ position: 3 })).toEqual([2, 1]);
    expect(run({ teamId: 1 })).toEqual([1, 3]);
    expect(run({ maxPrice: 100 })).toEqual([1, 3, 4]);
    expect(run({ query: "magalhaes" })).toEqual([3]);
    expect(run({ query: "mohamed" })).toEqual([2]);
    expect(run({ sort: "form" })).toEqual([3, 2, 1, 4]);
    expect(run({ sort: "price" })).toEqual([2, 1, 4, 3]);
  });
});

// ─── Comparison ─────────────────────────────────────────────────────────────

describe("comparison math", () => {
  it("works out per-90 figures, blank under 90 minutes", () => {
    expect(per90(3, 270)).toBe(1);
    expect(per90(1.37, 450)).toBe(0.27);
    expect(per90(5, 89)).toBeNull();
    expect(per90(0, 90)).toBe(0);
  });

  it("works out points per £m", () => {
    expect(pointsPerMillion(50, 100)).toBe(5);
    expect(pointsPerMillion(47, 45)).toBe(10.4);
    expect(pointsPerMillion(10, 0)).toBeNull();
  });

  it("marks the best values, all of them on a tie", () => {
    expect(bestIndexes([1, 3, 2], "higher")).toEqual([1]);
    expect(bestIndexes([1, 3, 2], "lower")).toEqual([0]);
    expect(bestIndexes([3, 3, 2], "higher")).toEqual([0, 1]);
    expect(bestIndexes([2, 2], "higher")).toEqual([]); // all equal
    expect(bestIndexes([null, 2], "higher")).toEqual([]); // only one value
    expect(bestIndexes([null, 2, 1], "lower")).toEqual([2]);
    expect(bestIndexes([5, 1], null)).toEqual([]); // no better direction
  });

  it("sums fixtures and averages difficulty, a double counting twice and a blank not at all", () => {
    const team: ToolTeam = {
      id: 1,
      short: "ARS",
      name: "Arsenal",
      fixtures: [
        [{ opponent: "CHE", home: true, difficulty: 4 }],
        [],
        [
          { opponent: "BUR", home: false, difficulty: 2 },
          { opponent: "LIV", home: true, difficulty: 5 },
        ],
      ],
    };
    expect(fixtureOutlook(team)).toEqual({ matches: 3, averageDifficulty: 3.67 });
    expect(fixtureOutlook({ ...team, fixtures: [[], []] })).toEqual({ matches: 0, averageDifficulty: null });
    expect(fixtureOutlook(undefined)).toEqual({ matches: 0, averageDifficulty: null });
  });

  it("builds one row per metric with the leaders marked", () => {
    const a = player(1, 3, 1, 100, { points: 60, minutes: 900, xg: 3, selected: 40 });
    const b = player(2, 3, 2, 80, { points: 40, minutes: 60, xg: 1, selected: 5 });
    const teams = new Map<number, ToolTeam>([
      [1, { id: 1, short: "A", name: "A", fixtures: [[{ opponent: "B", home: true, difficulty: 2 }]] }],
      [2, { id: 2, short: "B", name: "B", fixtures: [[{ opponent: "A", home: false, difficulty: 4 }]] }],
    ]);
    const rows = new Map(compareRows([a, b], teams).map((r) => [r.metric.id, r]));
    expect(rows.size).toBe(COMPARE_METRICS.length);
    expect(rows.get("price")!.best).toEqual([1]); // cheaper
    expect(rows.get("points")!.best).toEqual([0]);
    expect(rows.get("selected")!.best).toEqual([]); // ownership isn't better or worse
    expect(rows.get("ppm")!.values).toEqual([6, 5]);
    expect(rows.get("xg90")!.values).toEqual([0.3, null]); // b has under 90 minutes
    expect(rows.get("xg90")!.best).toEqual([]);
    expect(rows.get("difficulty")!.best).toEqual([0]);
    expect(rows.get("goals")!.best).toEqual([]); // 0 and 0
  });

  it("reads and writes the comparison link", () => {
    const known = new Map([1, 2, 3, 4, 5].map((id) => [id, true]));
    expect(decodeCompareIds("ids=3.1.3.99.2.4.5", known)).toEqual([3, 1, 2, 4]);
    expect(decodeCompareIds("", known)).toEqual([]);
    expect(encodeCompareIds([3, 1])).toBe("ids=3.1");
    expect(encodeCompareIds([])).toBe("");
  });
});

// ─── The data file, from the fixture snapshot ──────────────────────────────

describe("tools data file", () => {
  let snapshot: Snapshot;
  let data: ToolsData;
  let json: string;

  beforeAll(async () => {
    snapshot = (await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"))).snapshot;
    json = JSON.stringify(buildToolsData(snapshot));
    data = decodeToolsData(JSON.parse(json));
  });

  it("covers the next six gameweeks from the next deadline", () => {
    const next = snapshot.bootstrap.events.find((e) => e.is_next)!.id;
    const last = Math.max(...snapshot.bootstrap.events.map((e) => e.id));
    expect(data.gameweeks[0]).toBe(next);
    expect(data.gameweeks).toEqual(upcomingGameweeks(snapshot.bootstrap.events));
    expect(data.gameweeks.length).toBe(Math.min(6, last - next + 1));
  });

  it("has nothing upcoming once the last deadline has passed", () => {
    const ended = snapshot.bootstrap.events.map((e) => ({ ...e, is_next: false, is_current: e.id === 38 }));
    expect(upcomingGameweeks(ended)).toEqual([]);
    const preseason = snapshot.bootstrap.events.map((e) => ({ ...e, is_next: e.id === 1, is_current: false }));
    expect(upcomingGameweeks(preseason)[0]).toBe(1);
  });

  it("keeps every player with the right numbers", () => {
    expect(data.players).toHaveLength(snapshot.bootstrap.elements.length);
    for (const e of snapshot.bootstrap.elements) {
      const p = data.byId.get(e.id)!;
      expect(p.teamId).toBe(e.team);
      expect(p.position).toBe(e.element_type);
      expect(p.price).toBe(e.now_cost);
      expect(p.points).toBe(e.total_points);
      expect(p.minutes).toBe(e.minutes);
      expect(p.form).toBe(Number(e.form));
      expect(p.selected).toBe(Number(e.selected_by_percent));
      expect(p.xgi).toBeCloseTo(Number(e.expected_goal_involvements), 2);
      expect(p.defensiveContribution).toBe(e.defensive_contribution);
      expect(p.team).toBe(snapshot.bootstrap.teams.find((t) => t.id === e.team)!.short_name);
      expect(p.availability?.status ?? null, `player ${e.id}`).toBe(
        e.status === "a" && (e.chance_of_playing_next_round ?? 100) === 100 ? null : p.availability!.status,
      );
      if (e.news) expect(p.availability?.news).toBe(e.news);
    }
  });

  it("matches the fixture matrix for every team", () => {
    for (const team of data.teams.values()) {
      expect(team.fixtures).toHaveLength(data.gameweeks.length);
      data.gameweeks.forEach((gw, i) => {
        const expected = snapshot.fixtures
          .filter((f) => f.event === gw && (f.team_h === team.id || f.team_a === team.id))
          .map((f) => (f.team_h === team.id ? f.team_h_difficulty : f.team_a_difficulty))
          .sort();
        expect(team.fixtures[i].map((f) => f.difficulty).sort(), `${team.short} GW${gw}`).toEqual(expected);
      });
    }
  });

  it("stays small: about 100 bytes a player", () => {
    const perPlayer = json.length / data.players.length;
    expect(perPlayer).toBeLessThan(130);
    // A full season has about 850 players: well under 150 KB.
    expect(perPlayer * 850).toBeLessThan(150_000);
  });

  it("names the season, since player ids change between seasons", () => {
    expect(data.season).toMatch(/^\d{4}-\d{2}$/);
  });

  it("leaves out elements that aren't a squad position (managers, type 5), and skips bad rows when decoding", () => {
    const withManager = structuredClone(snapshot);
    withManager.bootstrap.elements.push({ ...withManager.bootstrap.elements[0], id: 99999, element_type: 5 });
    const file = buildToolsData(withManager);
    expect(file.players.map((p) => p[0])).not.toContain(99999);
    expect(file.players).toHaveLength(snapshot.bootstrap.elements.length);

    // A file that does hold one (say, from a newer build) decodes without it.
    const bad = JSON.parse(json);
    bad.players.push([99999, "Boss", "", bad.players[0][3], 5, 50, 0, 0, 0, 0, 0]);
    const decoded = decodeToolsData(bad);
    expect(decoded.byId.has(99999)).toBe(false);
    expect(decoded.players).toHaveLength(data.players.length);
  });

  it("puts the season in share links, and spots a link from another season", () => {
    const s = { ...EMPTY_STATE, squad: [101, 201] };
    const search = encodePlannerState(s, data.season);
    expect(search).toContain(`s=${data.season}`);
    expect(linkSeason(search)).toBe(data.season);
    expect(isOtherSeason(search, data.season)).toBe(false);
    expect(isOtherSeason(search, "2027-28")).toBe(true);
    // Links made before seasons were added are taken as current.
    expect(isOtherSeason("squad=1.2", data.season)).toBe(false);
    expect(encodeCompareIds([1, 2], data.season)).toBe(`ids=1.2&s=${data.season}`);
    expect(isOtherSeason(encodeCompareIds([1, 2], "2025-26"), data.season)).toBe(true);
    // The season doesn't change what a link decodes to.
    expect(decodePlannerState(search, BY_ID).state).toEqual(decodePlannerState(encodePlannerState(s), BY_ID).state);
  });

  it("rejects a file of another version", () => {
    expect(() => decodeToolsData({ ...JSON.parse(json), v: 2 })).toThrow(/version/);
    expect(() => decodeToolsData(null)).toThrow();
  });
});

// Pure logic for the interactive tools (/tools/planner/ and /tools/compare/):
// the compact data file's format and decoder, FPL's squad rules, the planner's
// state and its URL encoding, transfer costs and the comparison math.
//
// The tools run in the browser, so this file is bundled into client code: no
// Next.js, React, `@/` imports or Node APIs, and only light runtime imports
// from ../fpl (transforms.ts is already in the client bundle). The build-time
// encoder, which reads the snapshot, is in tools-data.ts.

import {
  AVAILABILITY_LABELS,
  availabilityOf,
  averageDifficulty,
  type Availability,
  type MatrixFixture,
} from "../fpl/transforms";

// ─── Paths ──────────────────────────────────────────────────────────────────

export const TOOLS_PATHS = {
  hub: "/tools/",
  planner: "/tools/planner/",
  compare: "/tools/compare/",
} as const;

/** Where the build writes the compact data file the tools fetch. */
export const TOOLS_DATA_PATH = "/tools/data.json";

// ─── FPL's squad rules ──────────────────────────────────────────────────────
//
// FPL's game settings aren't in the snapshot, so the rules are constants here.
// They have been the same for years: a £100.0m budget, 2 GK, 5 DEF, 5 MID and
// 3 FWD, at most 3 players from one club, and a starting XI with 1 goalkeeper,
// at least 3 defenders and at least 1 forward (which leaves 2 to 5
// midfielders). Every extra transfer costs 4 points, and up to 5 free
// transfers can be banked.

export type PositionId = 1 | 2 | 3 | 4;

export interface PositionRule {
  id: PositionId;
  short: string;
  plural: string;
  /** Players of this position in a full 15-player squad. */
  squad: number;
  /** Fewest and most of this position in a valid starting XI. */
  minXI: number;
  maxXI: number;
}

export const POSITION_RULES: readonly PositionRule[] = [
  { id: 1, short: "GKP", plural: "Goalkeepers", squad: 2, minXI: 1, maxXI: 1 },
  { id: 2, short: "DEF", plural: "Defenders", squad: 5, minXI: 3, maxXI: 5 },
  { id: 3, short: "MID", plural: "Midfielders", squad: 5, minXI: 2, maxXI: 5 },
  { id: 4, short: "FWD", plural: "Forwards", squad: 3, minXI: 1, maxXI: 3 },
];

export const POSITION_IDS: readonly PositionId[] = [1, 2, 3, 4];
export const SQUAD_SIZE = 15;
export const XI_SIZE = 11;
/** In tenths of a million, FPL's unit: 1000 = £100.0m. */
export const BUDGET = 1000;
export const MAX_PER_CLUB = 3;
export const TRANSFER_HIT = 4;
export const MAX_FREE_TRANSFERS = 5;

export const positionRule = (id: PositionId): PositionRule => POSITION_RULES[id - 1];

export const isPositionId = (n: unknown): n is PositionId => n === 1 || n === 2 || n === 3 || n === 4;

// ─── The data file ──────────────────────────────────────────────────────────
//
// One JSON file with only what the tools need. Players are arrays (tuples)
// rather than objects so the file stays small: the keys would otherwise be
// most of it. Trailing fields at their default (available, no chance, no news)
// are dropped.

export const TOOLS_DATA_VERSION = 1;

/** The columns of a player tuple, in order. Written into the file so it explains itself. */
export const PLAYER_FIELDS = [
  "id",
  "name",
  "fullName",
  "team",
  "position",
  "price",
  "points",
  "form",
  "selected",
  "minutes",
  "starts",
  "goals",
  "assists",
  "xg",
  "xa",
  "xgi",
  "bonus",
  "defensiveContribution",
  "cleanSheets",
  "saves",
  "status",
  "chance",
  "news",
] as const;

export type PlayerTuple = [
  id: number,
  name: string,
  fullName: string,
  team: number,
  position: number,
  price: number,
  points: number,
  form: number,
  selected: number,
  minutes: number,
  starts: number,
  goals: number,
  assists: number,
  xg: number,
  xa: number,
  xgi: number,
  bonus: number,
  defensiveContribution: number,
  cleanSheets: number,
  saves: number,
  status?: string,
  chance?: number | null,
  news?: string,
];

/** [opponent team id, 1 at home or 0 away, difficulty]. */
export type FixtureTuple = [opponent: number, home: 0 | 1, difficulty: number];

export interface ToolsDataFile {
  v: typeof TOOLS_DATA_VERSION;
  generatedAt: string;
  /** "2026-27": player ids are only stable within a season, so saved squads are kept per season. */
  season: string;
  /** The gameweeks `fixtures` covers, from the next deadline on; empty once the season is over. */
  gameweeks: number[];
  /** [id, short name, name]. */
  teams: [id: number, short: string, name: string][];
  /** Team id (as a string key) to one entry per gameweek in `gameweeks`: none in a blank, two in a double. */
  fixtures: Record<string, FixtureTuple[][]>;
  fields: readonly string[];
  players: PlayerTuple[];
}

export interface ToolTeam {
  id: number;
  short: string;
  name: string;
  /** One entry per gameweek in ToolsData.gameweeks. */
  fixtures: MatrixFixture[][];
}

export interface ToolPlayer {
  id: number;
  name: string;
  fullName: string;
  teamId: number;
  /** The team's short name ("ARS"). */
  team: string;
  position: PositionId;
  /** In tenths of a million (55 = £5.5m), so budget sums stay exact. */
  price: number;
  points: number;
  form: number;
  /** Percent of FPL managers who own the player. */
  selected: number;
  minutes: number;
  starts: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  xgi: number;
  bonus: number;
  defensiveContribution: number;
  cleanSheets: number;
  saves: number;
  availability: Availability | null;
}

export interface ToolsData {
  generatedAt: string;
  season: string;
  gameweeks: number[];
  teams: ReadonlyMap<number, ToolTeam>;
  players: ToolPlayer[];
  byId: ReadonlyMap<number, ToolPlayer>;
}

const isNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Turns the fetched data file into lookups. Throws on a file this version
 * doesn't understand (an old cached copy, say), so the page shows an error
 * rather than wrong numbers.
 */
export function decodeToolsData(raw: unknown): ToolsData {
  const file = raw as Partial<ToolsDataFile> | null;
  if (!file || file.v !== TOOLS_DATA_VERSION) throw new Error("Unsupported tools data version");
  if (!Array.isArray(file.teams) || !Array.isArray(file.players) || !Array.isArray(file.gameweeks)) {
    throw new Error("Malformed tools data");
  }
  const fixtures = file.fixtures ?? {};
  const shortById = new Map(file.teams.map(([id, short]) => [id, short]));

  const teams = new Map<number, ToolTeam>();
  for (const [id, short, name] of file.teams) {
    const weeks = fixtures[String(id)] ?? [];
    teams.set(id, {
      id,
      short,
      name,
      fixtures: file.gameweeks.map((_, i) =>
        (weeks[i] ?? []).map(([opponent, home, difficulty]) => ({
          opponent: shortById.get(opponent) ?? "?",
          home: home === 1,
          difficulty,
        })),
      ),
    });
  }

  const players: ToolPlayer[] = [];
  for (const t of file.players) {
    const [id, name, fullName, teamId, position, price, points, form, selected, minutes, starts] = t;
    if (!isNumber(id) || !isPositionId(position) || !isNumber(price) || !teams.has(teamId)) {
      throw new Error(`Malformed player in tools data: ${JSON.stringify(t)}`);
    }
    players.push({
      id,
      name,
      fullName: fullName || name,
      teamId,
      team: teams.get(teamId)!.short,
      position,
      price,
      points,
      form,
      selected,
      minutes,
      starts,
      goals: t[11],
      assists: t[12],
      xg: t[13],
      xa: t[14],
      xgi: t[15],
      bonus: t[16],
      defensiveContribution: t[17],
      cleanSheets: t[18],
      saves: t[19],
      availability: availabilityOf({
        status: t[20] ?? "a",
        chance_of_playing_next_round: t[21] ?? null,
        news: t[22] ?? "",
      }),
    });
  }

  return {
    generatedAt: String(file.generatedAt ?? ""),
    season: String(file.season ?? ""),
    gameweeks: file.gameweeks,
    teams,
    players,
    byId: new Map(players.map((p) => [p.id, p])),
  };
}

// ─── Formatting helpers (framework-free, shared by both tools) ─────────────

/** 55 -> "£5.5m"; negative -> "-£0.3m". */
export function formatTenths(tenths: number): string {
  const sign = tenths < 0 ? "-" : "";
  return `${sign}£${(Math.abs(tenths) / 10).toFixed(1)}m`;
}

/** "£5.5" or "5.5" typed by a user, to tenths. Null when it isn't a price. */
export function parseMillions(text: string): number | null {
  const clean = text.trim().replace(/^£/, "").replace(/m$/i, "");
  if (!/^\d{1,3}(\.\d)?$/.test(clean)) return null;
  return Math.round(Number(clean) * 10);
}

// ─── Squad arithmetic ───────────────────────────────────────────────────────

export type PlayerLookup = ReadonlyMap<
  number,
  Pick<ToolPlayer, "id" | "name" | "teamId" | "team" | "position" | "price" | "availability">
>;

export type PositionCounts = Record<PositionId, number>;

const zeroCounts = (): PositionCounts => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

/** How many of the given players play in each position. Unknown ids are skipped. */
export function positionCounts(ids: readonly number[], players: PlayerLookup): PositionCounts {
  const counts = zeroCounts();
  for (const id of ids) {
    const p = players.get(id);
    if (p) counts[p.position]++;
  }
  return counts;
}

/** Players per club (team id). */
export function clubCounts(ids: readonly number[], players: PlayerLookup): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of ids) {
    const p = players.get(id);
    if (p) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);
  }
  return counts;
}

/** Total price in tenths. */
export function squadCost(ids: readonly number[], players: PlayerLookup): number {
  return ids.reduce((sum, id) => sum + (players.get(id)?.price ?? 0), 0);
}

// ─── Formations ─────────────────────────────────────────────────────────────

const total = (c: PositionCounts) => c[1] + c[2] + c[3] + c[4];

/** "4-4-2" (defenders, midfielders, forwards). */
export const formationLabel = (c: PositionCounts) => `${c[2]}-${c[3]}-${c[4]}`;

/** A complete XI that FPL accepts: 11 players, 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD. */
export function isValidFormation(c: PositionCounts): boolean {
  return total(c) === XI_SIZE && POSITION_RULES.every((r) => c[r.id] >= r.minXI && c[r.id] <= r.maxXI);
}

/** Every formation FPL allows, as "D-M-F" labels. */
export const VALID_FORMATIONS: readonly string[] = (() => {
  const out: string[] = [];
  for (let d = 3; d <= 5; d++)
    for (let m = 2; m <= 5; m++) for (let f = 1; f <= 3; f++) if (1 + d + m + f === XI_SIZE) out.push(`${d}-${m}-${f}`);
  return out;
})();

/**
 * Whether a partial XI can still become a valid one by adding players: no
 * position over its maximum, and enough places left for every minimum.
 */
export function canCompleteFormation(c: PositionCounts): boolean {
  if (POSITION_RULES.some((r) => c[r.id] > r.maxXI)) return false;
  const free = XI_SIZE - total(c);
  if (free < 0) return false;
  const needed = POSITION_RULES.reduce((sum, r) => sum + Math.max(0, r.minXI - c[r.id]), 0);
  return needed <= free;
}

/** Whether a player of `position` can join these starters without making a valid XI impossible. */
export function canAddStarter(c: PositionCounts, position: PositionId): boolean {
  return canCompleteFormation({ ...c, [position]: c[position] + 1 });
}

/** Whether swapping a starter for a bench player keeps the XI completable (valid, if it was full). */
export function canSwap(c: PositionCounts, starterPosition: PositionId, benchPosition: PositionId): boolean {
  const next = { ...c, [starterPosition]: c[starterPosition] - 1 };
  next[benchPosition]++;
  return canCompleteFormation(next);
}

/**
 * A default starting XI for a squad: up to 1 GK, 4 DEF, 4 MID and 2 FWD in
 * squad order (4-4-2 for a full squad), then anyone else who fits.
 */
export function defaultStarters(squad: readonly number[], players: PlayerLookup): number[] {
  const target: PositionCounts = { 1: 1, 2: 4, 3: 4, 4: 2 };
  const counts = zeroCounts();
  const starters: number[] = [];
  for (const id of squad) {
    const p = players.get(id);
    if (p && counts[p.position] < target[p.position]) {
      counts[p.position]++;
      starters.push(id);
    }
  }
  for (const id of squad) {
    const p = players.get(id);
    if (!p || starters.includes(id) || starters.length >= XI_SIZE) continue;
    if (canAddStarter(counts, p.position)) {
      counts[p.position]++;
      starters.push(id);
    }
  }
  return starters;
}

// ─── Planner state ──────────────────────────────────────────────────────────

export type Chip = "none" | "wildcard" | "freehit";

export interface Transfer {
  out: number;
  /** Null until a replacement is picked. */
  in: number | null;
}

export interface PlannerState {
  mode: "squad" | "transfers";
  /** The squad being built, or in transfers mode the current squad before transfers. */
  squad: number[];
  transfers: Transfer[];
  /** Starters, captain and vice refer to the squad after transfers. */
  starters: number[];
  captain: number | null;
  vice: number | null;
  /** Money in the bank, in tenths (transfers mode). */
  bank: number;
  freeTransfers: number;
  chip: Chip;
}

export const EMPTY_STATE: PlannerState = {
  mode: "squad",
  squad: [],
  transfers: [],
  starters: [],
  captain: null,
  vice: null,
  bank: 0,
  freeTransfers: 1,
  chip: "none",
};

/** The squad after transfers: each player out is replaced by his replacement, or left out until one is picked. */
export function resultingSquad(state: Pick<PlannerState, "squad" | "transfers">): number[] {
  const byOut = new Map(state.transfers.map((t) => [t.out, t.in]));
  const out: number[] = [];
  for (const id of state.squad) {
    if (!byOut.has(id)) out.push(id);
    else {
      const replacement = byOut.get(id);
      if (replacement !== null && replacement !== undefined) out.push(replacement);
    }
  }
  return out;
}

const without = (ids: readonly number[], id: number) => ids.filter((x) => x !== id);
const replaceId = (ids: readonly number[], from: number, to: number) => ids.map((x) => (x === from ? to : x));

/**
 * Why a player can't be added to the squad right now, or null if he can.
 * The budget doesn't block: going over is shown as an error so the user can
 * see by how much, then sell someone.
 */
export function addBlockReason(state: PlannerState, id: number, players: PlayerLookup): string | null {
  const p = players.get(id);
  if (!p) return "Unknown player";
  const current = resultingSquad(state);
  if (current.includes(id)) return "In your squad";
  // Bringing back a player transferred out is cancelling that transfer.
  if (state.squad.includes(id)) return "Transferred out";
  const rule = positionRule(p.position);
  if (state.mode === "transfers") {
    if (!state.transfers.some((t) => t.in === null && players.get(t.out)?.position === p.position)) {
      return `Transfer a ${rule.short} out first`;
    }
  } else if (positionCounts(current, players)[p.position] >= rule.squad) {
    return `You have ${rule.squad} ${rule.plural.toLowerCase()}`;
  }
  // In transfers mode the player he replaces has already left the squad.
  if ((clubCounts(current, players).get(p.teamId) ?? 0) >= MAX_PER_CLUB) {
    return `${MAX_PER_CLUB} ${p.team} players already`;
  }
  return null;
}

/** Adds a player: to the squad in squad mode, or as the replacement for the first open transfer of his position. */
export function addPlayer(state: PlannerState, id: number, players: PlayerLookup): PlannerState {
  if (addBlockReason(state, id, players) !== null) return state;
  const p = players.get(id)!;
  const starterCounts = positionCounts(state.starters, players);
  if (state.mode === "transfers") {
    const index = state.transfers.findIndex((t) => t.in === null && players.get(t.out)?.position === p.position);
    const transfer = state.transfers[index];
    const transfers = state.transfers.map((t, i) => (i === index ? { ...t, in: id } : t));
    // The replacement takes the place he fills: in the XI if the player out was
    // a starter (his place is held as a gap), on the bench otherwise.
    const wasStarter = state.starters.includes(transfer.out);
    return {
      ...state,
      transfers,
      starters: wasStarter ? replaceId(state.starters, transfer.out, id) : state.starters,
    };
  }
  const starts = state.starters.length < XI_SIZE && canAddStarter(starterCounts, p.position);
  return {
    ...state,
    squad: [...state.squad, id],
    starters: starts ? [...state.starters, id] : state.starters,
  };
}

/** Removes a player from the squad (squad mode). */
export function removePlayer(state: PlannerState, id: number): PlannerState {
  return {
    ...state,
    squad: without(state.squad, id),
    starters: without(state.starters, id),
    captain: state.captain === id ? null : state.captain,
    vice: state.vice === id ? null : state.vice,
  };
}

/**
 * Marks a squad player as transferred out (transfers mode). A starter's place
 * in the XI is kept for his replacement; the armband is not, since the
 * replacement may not be the right captain.
 */
export function transferOut(state: PlannerState, id: number): PlannerState {
  if (!state.squad.includes(id) || state.transfers.some((t) => t.out === id)) return state;
  return {
    ...state,
    transfers: [...state.transfers, { out: id, in: null }],
    captain: state.captain === id ? null : state.captain,
    vice: state.vice === id ? null : state.vice,
  };
}

/** Undoes one transfer: the player comes back, in his replacement's place in the XI. */
export function cancelTransfer(state: PlannerState, outId: number): PlannerState {
  const transfer = state.transfers.find((t) => t.out === outId);
  if (!transfer) return state;
  let { starters, captain, vice } = state;
  if (transfer.in !== null) {
    starters = replaceId(starters, transfer.in, outId);
    if (captain === transfer.in) captain = null;
    if (vice === transfer.in) vice = null;
  }
  return { ...state, transfers: state.transfers.filter((t) => t !== transfer), starters, captain, vice };
}

/** Takes a replacement back out, leaving the transfer open. */
export function clearReplacement(state: PlannerState, outId: number): PlannerState {
  const transfer = state.transfers.find((t) => t.out === outId);
  if (!transfer || transfer.in === null) return state;
  const inId = transfer.in;
  return {
    ...state,
    transfers: state.transfers.map((t) => (t === transfer ? { ...t, in: null } : t)),
    starters: replaceId(state.starters, inId, outId),
    captain: state.captain === inId ? null : state.captain,
    vice: state.vice === inId ? null : state.vice,
  };
}

/**
 * Starting XI ids for the squad after transfers. A starter transferred out
 * with no replacement yet still holds his place (as a gap), so his
 * replacement starts; this drops those gaps.
 */
export function activeStarters(state: PlannerState): number[] {
  const current = new Set(resultingSquad(state));
  return state.starters.filter((id) => current.has(id));
}

/** Moves a starter to the bench. */
export function benchPlayer(state: PlannerState, id: number): PlannerState {
  if (!state.starters.includes(id)) return state;
  return {
    ...state,
    starters: without(state.starters, id),
    captain: state.captain === id ? null : state.captain,
    vice: state.vice === id ? null : state.vice,
  };
}

/** Starts a bench player, if the XI has room and stays completable. */
export function startPlayer(state: PlannerState, id: number, players: PlayerLookup): PlannerState {
  const p = players.get(id);
  if (!p || state.starters.includes(id) || !resultingSquad(state).includes(id)) return state;
  if (state.starters.length >= XI_SIZE) return state;
  if (!canAddStarter(positionCounts(state.starters, players), p.position)) return state;
  return { ...state, starters: [...state.starters, id] };
}

/** Swaps a starter and a bench player, if the XI stays completable. The armband stays with the starter's replacement only if picked again. */
export function swapPlayers(
  state: PlannerState,
  starterId: number,
  benchId: number,
  players: PlayerLookup,
): PlannerState {
  const s = players.get(starterId);
  const b = players.get(benchId);
  if (!s || !b || !state.starters.includes(starterId) || state.starters.includes(benchId)) return state;
  if (!resultingSquad(state).includes(benchId)) return state;
  if (!canSwap(positionCounts(state.starters, players), s.position, b.position)) return state;
  return {
    ...state,
    starters: replaceId(state.starters, starterId, benchId),
    captain: state.captain === starterId ? null : state.captain,
    vice: state.vice === starterId ? null : state.vice,
  };
}

/** Gives a starter the armband (or takes it back). Taking the vice's role clears it. */
export function setCaptain(state: PlannerState, id: number): PlannerState {
  if (!state.starters.includes(id)) return state;
  if (state.captain === id) return { ...state, captain: null };
  return { ...state, captain: id, vice: state.vice === id ? state.captain : state.vice };
}

export function setVice(state: PlannerState, id: number): PlannerState {
  if (!state.starters.includes(id)) return state;
  if (state.vice === id) return { ...state, vice: null };
  return { ...state, vice: id, captain: state.captain === id ? state.vice : state.captain };
}

/** Starts transfers mode on the current squad, with the money left from £100.0m in the bank. */
export function startTransfers(state: PlannerState, players: PlayerLookup): PlannerState {
  if (state.mode === "transfers") return state;
  return {
    ...state,
    mode: "transfers",
    transfers: [],
    bank: Math.max(0, BUDGET - squadCost(state.squad, players)),
  };
}

/** Back to building, allowed only once the transfers are kept or reset. */
export function startSquadMode(state: PlannerState): PlannerState {
  if (state.mode === "squad" || state.transfers.length > 0) return state;
  return { ...state, mode: "squad" };
}

/**
 * Makes the squad after transfers the current squad, as confirming them in
 * FPL would: the bank changes by what was sold minus what was bought, and
 * the free transfers used are spent. Open transfers (no replacement) are
 * dropped, so their players stay.
 */
export function keepTransfers(state: PlannerState, players: PlayerLookup): PlannerState {
  const done = state.transfers.filter((t) => t.in !== null);
  const summary = transferSummary(state, players);
  const kept: PlannerState = { ...state, transfers: done };
  const squad = resultingSquad(kept);
  const current = new Set(squad);
  return {
    ...state,
    squad,
    transfers: [],
    starters: state.starters.filter((id) => current.has(id)),
    bank: summary.bankAfter,
    freeTransfers: state.chip === "none" ? Math.max(0, state.freeTransfers - done.length) : state.freeTransfers,
    chip: "none",
  };
}

// ─── Transfers ──────────────────────────────────────────────────────────────

/** Points deducted for `made` transfers with `free` free ones. A wildcard or free hit makes them all free. */
export function transferHitCost(made: number, free: number, chip: Chip = "none"): number {
  if (chip !== "none") return 0;
  return Math.max(0, made - Math.max(0, free)) * TRANSFER_HIT;
}

export interface TransferSummary {
  /** Transfers with a replacement picked. */
  made: number;
  /** Players marked out with no replacement yet. */
  open: number;
  /** Transfers that cost points. */
  extra: number;
  /** Points deducted. */
  hitCost: number;
  /** Sale value of the players out and cost of the players in, in tenths. */
  sold: number;
  bought: number;
  /** Bank after the transfers made (open ones don't count yet). */
  bankAfter: number;
}

/**
 * Budget and points cost of the planned transfers. Players out are valued at
 * their current price; FPL pays only half of any rise since you bought them,
 * which the planner can't know, so the "bank" input is where to correct for it.
 */
export function transferSummary(
  state: Pick<PlannerState, "transfers" | "bank" | "freeTransfers" | "chip">,
  players: PlayerLookup,
): TransferSummary {
  const done = state.transfers.filter((t) => t.in !== null);
  const sold = squadCost(
    done.map((t) => t.out),
    players,
  );
  const bought = squadCost(
    done.map((t) => t.in!),
    players,
  );
  const hitCost = transferHitCost(done.length, state.freeTransfers, state.chip);
  return {
    made: done.length,
    open: state.transfers.length - done.length,
    extra: hitCost / TRANSFER_HIT,
    hitCost,
    sold,
    bought,
    bankAfter: state.bank + sold - bought,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "todo" | "warning";

export interface SquadIssue {
  code:
    | "squad-size"
    | "position-count"
    | "duplicate"
    | "club-limit"
    | "budget"
    | "xi-size"
    | "formation"
    | "captain"
    | "vice"
    | "open-transfer"
    | "unavailable";
  severity: IssueSeverity;
  message: string;
}

export interface SquadCheck {
  /** The squad after transfers. */
  squad: number[];
  starters: number[];
  counts: PositionCounts;
  starterCounts: PositionCounts;
  cost: number;
  /** Money left, in tenths: £100.0m minus the cost when building, the bank after transfers otherwise. */
  remaining: number;
  /** True when nothing is left to do and no rule is broken. */
  complete: boolean;
  issues: SquadIssue[];
}

/**
 * Checks the squad (after any transfers) against FPL's rules. Errors break
 * a rule, "todo" items are missing picks, and warnings are worth a look
 * (an injured starter) but allowed.
 */
export function checkSquad(state: PlannerState, players: PlayerLookup): SquadCheck {
  const squad = resultingSquad(state);
  const starters = activeStarters(state);
  const counts = positionCounts(squad, players);
  const starterCounts = positionCounts(starters, players);
  const cost = squadCost(squad, players);
  const remaining = state.mode === "transfers" ? transferSummary(state, players).bankAfter : BUDGET - cost;
  const issues: SquadIssue[] = [];

  if (new Set(squad).size !== squad.length) {
    issues.push({ code: "duplicate", severity: "error", message: "A player is in the squad twice." });
  }

  for (const r of POSITION_RULES) {
    if (counts[r.id] > r.squad) {
      issues.push({
        code: "position-count",
        severity: "error",
        message: `Too many ${r.plural.toLowerCase()}: ${counts[r.id]} of ${r.squad}.`,
      });
    }
  }

  const open = state.transfers.filter((t) => t.in === null);
  if (open.length > 0) {
    const names = open.map((t) => players.get(t.out)?.name ?? "a player").join(", ");
    issues.push({ code: "open-transfer", severity: "todo", message: `Pick a replacement for ${names}.` });
  } else if (squad.length < SQUAD_SIZE) {
    const missing = POSITION_RULES.filter((r) => counts[r.id] < r.squad)
      .map((r) => `${r.squad - counts[r.id]} ${r.short}`)
      .join(", ");
    issues.push({
      code: "squad-size",
      severity: "todo",
      message: `Pick ${SQUAD_SIZE - squad.length} more player${SQUAD_SIZE - squad.length === 1 ? "" : "s"} (${missing}).`,
    });
  }

  const clubs = new Map<number, { team: string; count: number }>();
  for (const id of squad) {
    const p = players.get(id);
    if (!p) continue;
    const entry = clubs.get(p.teamId) ?? { team: p.team, count: 0 };
    entry.count++;
    clubs.set(p.teamId, entry);
  }
  for (const { team, count } of clubs.values()) {
    if (count > MAX_PER_CLUB) {
      issues.push({
        code: "club-limit",
        severity: "error",
        message: `${count} players from ${team}: the limit is ${MAX_PER_CLUB} per club.`,
      });
    }
  }

  if (remaining < 0) {
    issues.push({
      code: "budget",
      severity: "error",
      message: `Over budget by ${formatTenths(-remaining)}.`,
    });
  }

  if (starters.length > XI_SIZE) {
    issues.push({ code: "xi-size", severity: "error", message: `${starters.length} starters: pick ${XI_SIZE}.` });
  } else if (squad.length > 0 && starters.length < XI_SIZE && open.length === 0) {
    const short = XI_SIZE - starters.length;
    // With a full squad, a short XI is a choice to make; while building it just fills up.
    if (squad.length >= SQUAD_SIZE) {
      issues.push({
        code: "xi-size",
        severity: "todo",
        message: `Start ${short} more player${short === 1 ? "" : "s"}: ${starters.length} of ${XI_SIZE} picked.`,
      });
    }
  }

  if (!canCompleteFormation(starterCounts)) {
    const broken = POSITION_RULES.filter((r) => starterCounts[r.id] > r.maxXI || starterCounts[r.id] < r.minXI)
      .map((r) => (starterCounts[r.id] > r.maxXI ? `at most ${r.maxXI} ${r.short}` : `at least ${r.minXI} ${r.short}`))
      .join(", ");
    issues.push({
      code: "formation",
      severity: "error",
      message: `The XI must have exactly 1 GKP, 3–5 DEF, 2–5 MID and 1–3 FWD (${broken || "check positions"}).`,
    });
  } else if (starters.length === XI_SIZE && !isValidFormation(starterCounts)) {
    issues.push({
      code: "formation",
      severity: "error",
      message: `${formationLabel(starterCounts)} isn't a valid formation.`,
    });
  }

  const activeSet = new Set(starters);
  const captain = state.captain !== null && activeSet.has(state.captain) ? state.captain : null;
  const vice = state.vice !== null && activeSet.has(state.vice) ? state.vice : null;
  if (starters.length > 0 && squad.length >= SQUAD_SIZE) {
    if (captain === null) issues.push({ code: "captain", severity: "todo", message: "Choose a captain from your XI." });
    if (vice === null) issues.push({ code: "vice", severity: "todo", message: "Choose a vice-captain from your XI." });
  }
  if (captain !== null && captain === vice) {
    issues.push({
      code: "vice",
      severity: "error",
      message: "The captain and vice-captain must be different players.",
    });
  }

  for (const id of starters) {
    const p = players.get(id);
    const a = p?.availability;
    if (!p || !a) continue;
    const detail = a.chance !== null ? `${a.chance}% chance of playing` : a.news;
    issues.push({
      code: "unavailable",
      severity: "warning",
      message: `${p.name} (${p.team}) is in your XI: ${AVAILABILITY_LABELS[a.status].toLowerCase()}${detail ? `, ${detail}` : ""}.`,
    });
  }

  return {
    squad,
    starters,
    counts,
    starterCounts,
    cost,
    remaining,
    complete: squad.length === SQUAD_SIZE && !issues.some((i) => i.severity !== "warning"),
    issues,
  };
}

// ─── URL encoding ───────────────────────────────────────────────────────────
//
// The planner's state as short query parameters, so a squad is a shareable
// link: ?squad=1.2.3&bench=2&c=3&vc=1, plus mode=transfers&out=5.6&in=7.0&ft=1&bank=5&chip=wc.
// Ids are joined by "." (safe in a URL without escaping). "in" lines up with
// "out"; 0 is a transfer with no replacement yet.

const CHIP_CODES: Record<Exclude<Chip, "none">, string> = { wildcard: "wc", freehit: "fh" };

const joinIds = (ids: readonly number[]) => ids.join(".");
const splitIds = (text: string | null): number[] =>
  (text ?? "")
    .split(".")
    .filter((s) => /^\d{1,6}$/.test(s))
    .map(Number);

export function encodePlannerState(state: PlannerState): string {
  const params = new URLSearchParams();
  if (state.squad.length === 0) return "";
  params.set("squad", joinIds(state.squad));
  // Store the bench rather than the XI: it's shorter, and an empty bench is
  // the common case while building. Slots, not the resulting squad, so a
  // player transferred out with no replacement yet keeps his bench place.
  const bench = resultingSlots(state).filter((id) => !state.starters.includes(id));
  if (bench.length > 0) params.set("bench", joinIds(bench));
  if (state.captain !== null) params.set("c", String(state.captain));
  if (state.vice !== null) params.set("vc", String(state.vice));
  if (state.mode === "transfers") {
    params.set("mode", "transfers");
    if (state.transfers.length > 0) {
      params.set("out", joinIds(state.transfers.map((t) => t.out)));
      params.set("in", joinIds(state.transfers.map((t) => t.in ?? 0)));
    }
    params.set("ft", String(state.freeTransfers));
    params.set("bank", String(state.bank));
    if (state.chip !== "none") params.set("chip", CHIP_CODES[state.chip]);
  }
  return params.toString();
}

export interface DecodedPlannerState {
  state: PlannerState;
  /** Ids in the link that aren't in this season's data (or broke a rule) and were left out. */
  dropped: number;
}

/**
 * Reads a planner link. Anything unknown or impossible is dropped rather than
 * trusted: players not in the data, duplicates, a fourth goalkeeper, a
 * transfer for a player who isn't in the squad. Starters are rebuilt from
 * the bench (or picked by default) and kept only if they form a completable XI.
 */
export function decodePlannerState(search: string, players: PlayerLookup): DecodedPlannerState {
  const params = new URLSearchParams(search);
  let dropped = 0;

  const squad: number[] = [];
  const counts = zeroCounts();
  for (const id of splitIds(params.get("squad"))) {
    const p = players.get(id);
    if (
      !p ||
      squad.includes(id) ||
      squad.length >= SQUAD_SIZE ||
      counts[p.position] >= positionRule(p.position).squad
    ) {
      dropped++;
      continue;
    }
    counts[p.position]++;
    squad.push(id);
  }
  if (squad.length === 0) return { state: { ...EMPTY_STATE }, dropped };

  const mode = params.get("mode") === "transfers" ? "transfers" : "squad";
  const transfers: Transfer[] = [];
  if (mode === "transfers") {
    const outs = splitIds(params.get("out"));
    const ins = splitIds(params.get("in"));
    const used = new Set(squad);
    outs.forEach((out, i) => {
      if (!squad.includes(out) || transfers.some((t) => t.out === out)) {
        dropped++;
        return;
      }
      const inId = ins[i] ?? 0;
      const incoming = players.get(inId);
      const valid = incoming && !used.has(inId) && incoming.position === players.get(out)!.position;
      if (inId !== 0 && !valid) dropped++;
      transfers.push({ out, in: valid ? inId : null });
      if (valid) used.add(inId);
    });
  }

  const draft: PlannerState = { ...EMPTY_STATE, mode, squad, transfers };
  const resulting = resultingSquad(draft);
  const hasBench = params.has("bench");
  const bench = new Set(splitIds(params.get("bench")));
  // A starter out with no replacement keeps his place, as in transferOut.
  const slots = resultingSlots(draft);
  let starters = hasBench ? slots.filter((id) => !bench.has(id)) : defaultStarters(slots, players);
  const starterCounts = positionCounts(starters, players);
  if (starters.length > XI_SIZE || !canCompleteFormation(starterCounts)) {
    starters = defaultStarters(slots, players);
  }

  const asStarter = (text: string | null) => {
    const id = Number(text);
    return text && starters.includes(id) && resulting.includes(id) ? id : null;
  };
  const captain = asStarter(params.get("c"));
  const viceRaw = asStarter(params.get("vc"));
  const vice = viceRaw === captain ? null : viceRaw;

  const ft = Number(params.get("ft"));
  const bank = Number(params.get("bank"));
  const chipCode = params.get("chip");
  const chip: Chip = chipCode === "wc" ? "wildcard" : chipCode === "fh" ? "freehit" : "none";

  return {
    state: {
      mode,
      squad,
      transfers,
      starters,
      captain,
      vice,
      bank: mode === "transfers" && Number.isInteger(bank) && bank >= 0 && bank <= 1000 ? bank : 0,
      freeTransfers: mode === "transfers" && Number.isInteger(ft) && ft >= 0 && ft <= MAX_FREE_TRANSFERS ? ft : 1,
      chip: mode === "transfers" ? chip : "none",
    },
    dropped,
  };
}

/** The squad after transfers, with an open transfer's player out still holding his place. */
function resultingSlots(state: Pick<PlannerState, "squad" | "transfers">): number[] {
  const byOut = new Map(state.transfers.map((t) => [t.out, t.in]));
  return state.squad.map((id) => (byOut.has(id) ? (byOut.get(id) ?? id) : id));
}

// ─── Search and filters ─────────────────────────────────────────────────────

export type PlayerSort = "points" | "price" | "form" | "selected" | "xgi";

export interface PlayerFilter {
  query: string;
  position: PositionId | null;
  teamId: number | null;
  /** In tenths; null for any price. */
  maxPrice: number | null;
  sort: PlayerSort;
}

export const DEFAULT_FILTER: PlayerFilter = { query: "", position: null, teamId: null, maxPrice: null, sort: "points" };

/** Filters and sorts players for the pickers. `matches` is the site's name search (matchesPlayerSearch). */
export function filterPlayers<P extends Pick<ToolPlayer, "id" | "position" | "teamId" | "price" | PlayerSort>>(
  players: readonly P[],
  filter: PlayerFilter,
  matches: (player: P, query: string) => boolean,
): P[] {
  const out = players.filter(
    (p) =>
      (filter.position === null || p.position === filter.position) &&
      (filter.teamId === null || p.teamId === filter.teamId) &&
      (filter.maxPrice === null || p.price <= filter.maxPrice) &&
      (!filter.query.trim() || matches(p, filter.query)),
  );
  return out.sort((a, b) => b[filter.sort] - a[filter.sort] || b.points - a.points || a.id - b.id);
}

// ─── Comparison ─────────────────────────────────────────────────────────────

export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;
/** Per-90 figures from fewer minutes than this are too noisy to compare, so they're left blank. */
export const MIN_MINUTES_PER_90 = 90;

/** value per 90 minutes, to 2 decimals; null below MIN_MINUTES_PER_90. */
export function per90(value: number, minutes: number): number | null {
  if (minutes < MIN_MINUTES_PER_90) return null;
  return Math.round((value / minutes) * 90 * 100) / 100;
}

/** Points per £1m of price, to 1 decimal; null for a price of 0. */
export function pointsPerMillion(points: number, priceTenths: number): number | null {
  if (priceTenths <= 0) return null;
  return Math.round((points / (priceTenths / 10)) * 10) / 10;
}

export interface FixtureOutlook {
  /** Matches in the window: a blank counts 0, a double 2. */
  matches: number;
  /** Mean difficulty of those matches, to 2 decimals; null with none. */
  averageDifficulty: number | null;
}

/** Matches and average difficulty over a team's next gameweeks. Reuses the fixture matrix's average (a double counts twice). */
export function fixtureOutlook(team: Pick<ToolTeam, "short" | "fixtures"> | undefined): FixtureOutlook {
  if (!team) return { matches: 0, averageDifficulty: null };
  const weeks = team.fixtures;
  const avg = averageDifficulty({ team: team.short, weeks }, 1, weeks.length);
  return {
    matches: weeks.reduce((n, w) => n + w.length, 0),
    averageDifficulty: avg === undefined ? null : Math.round(avg * 100) / 100,
  };
}

export type MetricFormat = "price" | "int" | "dec1" | "dec2" | "pct";

export interface CompareMetric {
  id: string;
  label: string;
  group: "Overview" | "Attack" | "Per 90 minutes" | "Defence and bonus" | "Fixtures";
  /** Which way is better; null when neither is (ownership). */
  better: "higher" | "lower" | null;
  format: MetricFormat;
  /** Short note shown with the label. */
  hint?: string;
  value: (p: ToolPlayer, team: ToolTeam | undefined) => number | null;
}

export const COMPARE_METRICS: readonly CompareMetric[] = [
  { id: "price", label: "Price", group: "Overview", better: "lower", format: "price", value: (p) => p.price },
  { id: "selected", label: "Ownership", group: "Overview", better: null, format: "pct", value: (p) => p.selected },
  { id: "points", label: "Total points", group: "Overview", better: "higher", format: "int", value: (p) => p.points },
  {
    id: "form",
    label: "Form",
    group: "Overview",
    better: "higher",
    format: "dec1",
    hint: "Points per match over 30 days",
    value: (p) => p.form,
  },
  {
    id: "ppm",
    label: "Points per £m",
    group: "Overview",
    better: "higher",
    format: "dec1",
    value: (p) => pointsPerMillion(p.points, p.price),
  },
  { id: "minutes", label: "Minutes", group: "Overview", better: "higher", format: "int", value: (p) => p.minutes },
  { id: "starts", label: "Starts", group: "Overview", better: "higher", format: "int", value: (p) => p.starts },

  { id: "goals", label: "Goals", group: "Attack", better: "higher", format: "int", value: (p) => p.goals },
  { id: "assists", label: "Assists", group: "Attack", better: "higher", format: "int", value: (p) => p.assists },
  { id: "xg", label: "Expected goals (xG)", group: "Attack", better: "higher", format: "dec2", value: (p) => p.xg },
  { id: "xa", label: "Expected assists (xA)", group: "Attack", better: "higher", format: "dec2", value: (p) => p.xa },
  {
    id: "xgi",
    label: "Expected goal involvements (xGI)",
    group: "Attack",
    better: "higher",
    format: "dec2",
    value: (p) => p.xgi,
  },

  {
    id: "points90",
    label: "Points per 90",
    group: "Per 90 minutes",
    better: "higher",
    format: "dec2",
    value: (p) => per90(p.points, p.minutes),
  },
  {
    id: "xg90",
    label: "xG per 90",
    group: "Per 90 minutes",
    better: "higher",
    format: "dec2",
    value: (p) => per90(p.xg, p.minutes),
  },
  {
    id: "xa90",
    label: "xA per 90",
    group: "Per 90 minutes",
    better: "higher",
    format: "dec2",
    value: (p) => per90(p.xa, p.minutes),
  },
  {
    id: "xgi90",
    label: "xGI per 90",
    group: "Per 90 minutes",
    better: "higher",
    format: "dec2",
    value: (p) => per90(p.xgi, p.minutes),
  },
  {
    id: "dc90",
    label: "Defensive contributions per 90",
    group: "Per 90 minutes",
    better: "higher",
    format: "dec2",
    value: (p) => per90(p.defensiveContribution, p.minutes),
  },

  {
    id: "cs",
    label: "Clean sheets",
    group: "Defence and bonus",
    better: "higher",
    format: "int",
    value: (p) => p.cleanSheets,
  },
  {
    id: "dc",
    label: "Defensive contributions",
    group: "Defence and bonus",
    better: "higher",
    format: "int",
    hint: "Clearances, blocks, interceptions, tackles (and recoveries for MID and FWD)",
    value: (p) => p.defensiveContribution,
  },
  { id: "saves", label: "Saves", group: "Defence and bonus", better: "higher", format: "int", value: (p) => p.saves },
  {
    id: "bonus",
    label: "Bonus points",
    group: "Defence and bonus",
    better: "higher",
    format: "int",
    value: (p) => p.bonus,
  },

  {
    id: "matches",
    label: "Matches",
    group: "Fixtures",
    better: "higher",
    format: "int",
    hint: "A blank counts 0, a double 2",
    value: (_, t) => fixtureOutlook(t).matches,
  },
  {
    id: "difficulty",
    label: "Average difficulty",
    group: "Fixtures",
    better: "lower",
    format: "dec2",
    hint: "FPL's rating: 1 easiest, 5 hardest",
    value: (_, t) => fixtureOutlook(t).averageDifficulty,
  },
];

/**
 * Which columns hold the best value: all tied leaders, ignoring blanks. None
 * when fewer than two players have a value, when every value is the same, or
 * when the metric has no better direction.
 */
export function bestIndexes(values: readonly (number | null)[], better: CompareMetric["better"]): number[] {
  if (better === null) return [];
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return [];
  const best = better === "higher" ? Math.max(...present) : Math.min(...present);
  if (present.every((v) => v === best)) return [];
  return values.flatMap((v, i) => (v === best ? [i] : []));
}

export interface CompareRow {
  metric: CompareMetric;
  values: (number | null)[];
  best: number[];
}

/** One row per metric, with the values for each player and the best ones marked. */
export function compareRows(players: readonly ToolPlayer[], teams: ReadonlyMap<number, ToolTeam>): CompareRow[] {
  return COMPARE_METRICS.map((metric) => {
    const values = players.map((p) => metric.value(p, teams.get(p.teamId)));
    return { metric, values, best: bestIndexes(values, metric.better) };
  });
}

/** The comparison's player ids from ?ids=1.2.3: known, distinct, at most MAX_COMPARE. */
export function decodeCompareIds(search: string, players: ReadonlyMap<number, unknown>): number[] {
  const ids: number[] = [];
  for (const id of splitIds(new URLSearchParams(search).get("ids"))) {
    if (players.has(id) && !ids.includes(id) && ids.length < MAX_COMPARE) ids.push(id);
  }
  return ids;
}

export const encodeCompareIds = (ids: readonly number[]): string =>
  ids.length ? new URLSearchParams({ ids: joinIds(ids) }).toString() : "";

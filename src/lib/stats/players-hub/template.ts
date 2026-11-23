// The template team: the valid 15-man squad with the highest total ownership
// (`selected_by_percent`), and its most-owned starting XI in a valid formation.

import type { Bootstrap, Element } from "../../fpl/schemas";
import { hubPlayers, roundTo, toMillions, type HubBootstrap, type HubPlayer } from "./common";

/** FPL's squad rules: 2 GK, 5 DEF, 5 MID, 3 FWD, at most 3 players from one club. */
export const SQUAD_QUOTAS: Readonly<Record<number, number>> = { 1: 2, 2: 5, 3: 5, 4: 3 };
export const SQUAD_SIZE = 15;
export const MAX_PER_CLUB = 3;
/** Starting XI: 1 GK and at least 3 DEF, 2 MID and 1 FWD (the squad caps the maximums at 5, 5 and 3). */
export const XI_MINIMUMS: Readonly<Record<number, number>> = { 1: 1, 2: 3, 3: 2, 4: 1 };
export const XI_SIZE = 11;
/** Every manager's starting budget, in £m. */
export const STARTING_BUDGET = 100;

export interface TemplateLine {
  positionId: number;
  /** "Goalkeepers". */
  label: string;
  players: HubPlayer[];
}

export interface TemplateTeam {
  /** The starting XI by position, most-owned first within each line. */
  lines: TemplateLine[];
  /** FPL bench order: the second goalkeeper, then outfield players most-owned first. */
  bench: HubPlayer[];
  /** "3-4-3". */
  formation: string;
  squadCost: number;
  startingCost: number;
  /** Mean ownership of the 15, in percent. */
  averageOwnership: number;
  /** The most-captained player in the gameweek FPL reports it for, when they're in the XI. */
  captain: { id: number; gameweek: number } | null;
}

interface Candidate {
  element: Element;
  weight: number;
}

/**
 * Picks `SQUAD_SIZE` players, at most `quotas[position]` per position and
 * `MAX_PER_CLUB` per club, with the largest total weight. Exact: it is a
 * min-cost flow (source → club, capacity 3 → player, capacity 1 → position,
 * capacity quota → sink), solved by successive shortest paths with
 * Bellman-Ford. Null when no valid squad exists.
 */
export function pickMaxWeightSquad(
  candidates: readonly Candidate[],
  quotas: Readonly<Record<number, number>> = SQUAD_QUOTAS,
  maxPerClub = MAX_PER_CLUB,
): Element[] | null {
  const size = Object.values(quotas).reduce((a, b) => a + b, 0);
  const clubs = [...new Set(candidates.map((c) => c.element.team))];
  const positions = Object.keys(quotas).map(Number);
  const source = 0;
  const clubNode = new Map(clubs.map((c, i) => [c, 1 + i]));
  const playerBase = 1 + clubs.length;
  const positionNode = new Map(positions.map((p, i) => [p, playerBase + candidates.length + i]));
  const sink = playerBase + candidates.length + positions.length;
  const nodeCount = sink + 1;

  // Edge arrays: to, capacity, cost; edge i ^ 1 is its reverse.
  const to: number[] = [];
  const cap: number[] = [];
  const cost: number[] = [];
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  const addEdge = (u: number, v: number, capacity: number, c: number) => {
    adjacency[u].push(to.length);
    to.push(v);
    cap.push(capacity);
    cost.push(c);
    adjacency[v].push(to.length);
    to.push(u);
    cap.push(0);
    cost.push(-c);
  };

  for (const node of clubNode.values()) addEdge(source, node, maxPerClub, 0);
  const playerEdge: number[] = [];
  candidates.forEach((c, i) => {
    const position = positionNode.get(c.element.element_type);
    if (position === undefined) return;
    playerEdge[i] = to.length;
    addEdge(clubNode.get(c.element.team)!, playerBase + i, 1, -c.weight);
    addEdge(playerBase + i, position, 1, 0);
  });
  for (const [p, node] of positionNode) addEdge(node, sink, quotas[p], 0);

  for (let flow = 0; flow < size; flow++) {
    const dist = new Array<number>(nodeCount).fill(Infinity);
    const via = new Array<number>(nodeCount).fill(-1);
    dist[source] = 0;
    for (let round = 0; round < nodeCount; round++) {
      let changed = false;
      for (let u = 0; u < nodeCount; u++) {
        if (dist[u] === Infinity) continue;
        for (const e of adjacency[u]) {
          if (cap[e] > 0 && dist[u] + cost[e] < dist[to[e]]) {
            dist[to[e]] = dist[u] + cost[e];
            via[to[e]] = e;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (dist[sink] === Infinity) return null;
    for (let v = sink; v !== source; v = to[via[v] ^ 1]) {
      cap[via[v]] -= 1;
      cap[via[v] ^ 1] += 1;
    }
  }

  return candidates.filter((_, i) => playerEdge[i] !== undefined && cap[playerEdge[i]] === 0).map((c) => c.element);
}

/** Ownership in tenths of a percent, FPL's precision, as an integer. */
const ownershipTenths = (e: Element) => Math.round(Number(e.selected_by_percent) * 10);

/** Most-owned first, then more points, then lower id: the tie-break order everywhere on this page. */
const templateOrder = (a: Element, b: Element) =>
  ownershipTenths(b) - ownershipTenths(a) || b.total_points - a.total_points || a.id - b.id;

/**
 * Candidate weights: total ownership decides, and the tie-break order only
 * separates squads with equal ownership. Each weight is ownership × M plus
 * (n − rank); 15 tie-break terms add up to less than M, so they never
 * outweigh a tenth of a percent of ownership.
 */
function weighted(elements: readonly Element[]): Candidate[] {
  const sorted = [...elements].sort(templateOrder);
  const n = sorted.length;
  const scale = (SQUAD_SIZE + 1) * (n + 1);
  return sorted.map((element, rank) => ({ element, weight: ownershipTenths(element) * scale + (n - rank) }));
}

/**
 * Only the 3 most-owned players of each position at each club can be in the
 * best squad (a club has at most 3 players in it), so the rest are dropped
 * before the flow.
 */
function shortlist(elements: readonly Element[]): Element[] {
  const kept = new Map<string, number>();
  return [...elements].sort(templateOrder).filter((e) => {
    const key = `${e.team}:${e.element_type}`;
    const count = kept.get(key) ?? 0;
    if (count >= MAX_PER_CLUB) return false;
    kept.set(key, count + 1);
    return true;
  });
}

/** The XI: the minimum per position first, then the most-owned of the rest. Input sorted by templateOrder. */
export function pickStartingXI(squad: readonly Element[]): { starting: Element[]; bench: Element[] } {
  const starting = new Set<Element>();
  for (const [position, min] of Object.entries(XI_MINIMUMS)) {
    squad.filter((e) => e.element_type === Number(position)).slice(0, min).forEach((e) => starting.add(e));
  }
  for (const e of squad) {
    if (starting.size >= XI_SIZE) break;
    if (e.element_type !== 1) starting.add(e);
  }
  const rest = squad.filter((e) => !starting.has(e));
  // FPL's bench: the goalkeeper first, then the outfield players.
  const bench = [...rest.filter((e) => e.element_type === 1), ...rest.filter((e) => e.element_type !== 1)];
  return { starting: squad.filter((e) => starting.has(e)), bench };
}

/** Null when no valid squad exists or nobody owns anyone yet (ownership is what the template is made of). */
export function buildTemplateTeam(bootstrap: HubBootstrap & Pick<Bootstrap, "events">): TemplateTeam | null {
  if (!bootstrap.elements.some((e) => ownershipTenths(e) > 0)) return null;
  const squadElements = pickMaxWeightSquad(weighted(shortlist(bootstrap.elements)));
  if (!squadElements) return null;
  const squad = squadElements.sort(templateOrder);
  const { starting, bench } = pickStartingXI(squad);

  const toPlayer = hubPlayers(bootstrap);
  const plural = new Map(bootstrap.element_types.map((p) => [p.id, p.plural_name]));
  const lines = [1, 2, 3, 4].map((positionId) => ({
    positionId,
    label: plural.get(positionId) ?? `Position ${positionId}`,
    players: starting.filter((e) => e.element_type === positionId).map(toPlayer),
  }));

  const tenths = (list: readonly Element[]) => list.reduce((sum, e) => sum + e.now_cost, 0);
  const event = bootstrap.events.find((e) => e.is_current) ?? bootstrap.events.find((e) => e.is_previous);
  const captainId = event?.most_captained ?? null;

  return {
    lines,
    bench: bench.map(toPlayer),
    formation: lines.slice(1).map((l) => l.players.length).join("-"),
    squadCost: toMillions(tenths(squad)),
    startingCost: toMillions(tenths(starting)),
    averageOwnership: roundTo(squad.reduce((sum, e) => sum + Number(e.selected_by_percent), 0) / squad.length, 1),
    captain:
      event && captainId !== null && starting.some((e) => e.id === captainId)
        ? { id: captainId, gameweek: event.id }
        : null,
  };
}

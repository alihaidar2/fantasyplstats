// Shared pieces of the players hub (availability, prices, value, set pieces,
// template team). Pure functions of the snapshot's bootstrap data. Relative
// imports only, and no Next.js or React, like src/lib/fpl/.

import { availabilityOf, type Availability } from "../../fpl/transforms";
import type { Bootstrap, Element } from "../../fpl/schemas";
import { PATHS } from "../../site";
import { buildClubs } from "../teams";

/** The hub's pages, as site paths ending in "/" (trailingSlash: true). */
export const PLAYERS_HUB_PATHS = {
  availability: PATHS.availability,
  prices: PATHS.prices,
  value: PATHS.value,
  setPieces: PATHS.setPieces,
  template: PATHS.template,
} as const;

export type HubBootstrap = Pick<Bootstrap, "teams" | "element_types" | "elements">;

/** The few fields every hub list shows for a player. */
export interface HubPlayer {
  id: number;
  /** FPL's short name ("Saka"). */
  name: string;
  /** First and second name, for tooltips. */
  fullName: string;
  /** Club short name ("ARS"). */
  team: string;
  teamId: number;
  /** The club's page (/teams/arsenal/); "" for a club FPL no longer lists. */
  teamPath: string;
  /** "GKP", "DEF", "MID" or "FWD". */
  position: string;
  positionId: number;
  /** £m. */
  price: number;
  /** Percent of FPL managers who own the player. */
  ownership: number;
  /** Null when fully available. */
  availability: Availability | null;
}

/** A price in tenths of a million (FPL's unit) as £m, without floating-point noise. */
export const toMillions = (tenths: number) => Math.round(tenths) / 10;

/** Rounds to `digits` decimals for display and stable sorting. */
export const roundTo = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const fullNameOf = (e: Element) => `${e.first_name} ${e.second_name}`.trim() || e.web_name;

/** Builds HubPlayers from bootstrap elements, sharing the team and position lookups. */
export function hubPlayers(bootstrap: Pick<HubBootstrap, "teams" | "element_types">) {
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const clubPaths = new Map(buildClubs(bootstrap.teams).map((c) => [c.id, c.path]));
  const positions = new Map(bootstrap.element_types.map((p) => [p.id, p.singular_name_short]));
  return (e: Element): HubPlayer => ({
    id: e.id,
    name: e.web_name.trim() || fullNameOf(e),
    fullName: fullNameOf(e),
    team: teams.get(e.team) ?? "—",
    teamId: e.team,
    teamPath: clubPaths.get(e.team) ?? "",
    position: positions.get(e.element_type) ?? "—",
    positionId: e.element_type,
    price: toMillions(e.now_cost),
    ownership: Number(e.selected_by_percent),
    availability: availabilityOf(e),
  });
}

/** Most-owned first, then by id so the order is stable between builds. */
export const byOwnership = (a: Pick<Element, "selected_by_percent" | "id">, b: Pick<Element, "selected_by_percent" | "id">) =>
  Number(b.selected_by_percent) - Number(a.selected_by_percent) || a.id - b.id;

// Set-piece takers per club from FPL's `penalties_order`,
// `direct_freekicks_order` and `corners_and_indirect_freekicks_order`.

import { SET_PIECE_LABELS, setPieceDuties, type SetPieceKind } from "../../fpl/transforms";
import type { Bootstrap } from "../../fpl/schemas";
import { buildClubs } from "../teams";
import { byOwnership, hubPlayers, type HubBootstrap, type HubPlayer } from "./common";

export interface SetPieceTaker extends HubPlayer {
  /** 1 is first choice. */
  order: number;
}

export interface ClubSetPieces {
  teamId: number;
  name: string;
  shortName: string;
  /** The club's `code`, for its badge image. */
  code: number;
  /** The club's page (/teams/arsenal/). */
  path: string;
  duties: { kind: SetPieceKind; label: string; takers: SetPieceTaker[] }[];
}

const KINDS: readonly SetPieceKind[] = ["penalties", "freekicks", "corners"];

/**
 * Every club (alphabetical), with its takers for each kind of set piece in
 * FPL's order. Two players FPL gives the same order are listed most-owned
 * first. A kind with no takers has an empty list.
 */
export function buildSetPieces(bootstrap: HubBootstrap & Pick<Bootstrap, "teams">): ClubSetPieces[] {
  const toPlayer = hubPlayers(bootstrap);
  const takers = new Map<string, SetPieceTaker[]>();
  for (const e of [...bootstrap.elements].sort(byOwnership)) {
    for (const duty of setPieceDuties(e)) {
      const key = `${e.team}:${duty.kind}`;
      const list = takers.get(key) ?? [];
      list.push({ ...toPlayer(e), order: duty.order });
      takers.set(key, list);
    }
  }

  const clubPaths = new Map(buildClubs(bootstrap.teams).map((c) => [c.id, c.path]));
  return [...bootstrap.teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      teamId: t.id,
      name: t.name,
      shortName: t.short_name,
      code: t.code,
      path: clubPaths.get(t.id) ?? "",
      duties: KINDS.map((kind) => ({
        kind,
        label: SET_PIECE_LABELS[kind],
        // Stable sort: equal orders keep the most-owned first.
        takers: [...(takers.get(`${t.id}:${kind}`) ?? [])].sort((a, b) => a.order - b.order),
      })),
    }));
}

/** Whether FPL has published any set-piece order (it hasn't before the season's first update). */
export const hasSetPieceData = (clubs: readonly ClubSetPieces[]) =>
  clubs.some((c) => c.duties.some((d) => d.takers.length > 0));

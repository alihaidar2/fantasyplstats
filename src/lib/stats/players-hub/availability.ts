// Injuries, doubts, suspensions and other absences from bootstrap `status`,
// `chance_of_playing_next_round`, `news` and `news_added`.

import { AVAILABILITY_LABELS, type AvailabilityStatus } from "../../fpl/transforms";
import { byOwnership, hubPlayers, type HubBootstrap, type HubPlayer } from "./common";

export interface AvailabilityRow extends HubPlayer {
  /** FPL's chance of playing in the next gameweek, in percent; null when FPL gives none. */
  chance: number | null;
  news: string;
  /** When FPL last updated the news (ISO time); null when unknown. */
  newsAdded: string | null;
}

export interface AvailabilityGroup {
  status: AvailabilityStatus;
  label: string;
  /** Most-owned first. */
  players: AvailabilityRow[];
}

/** Group order on the page: the statuses managers act on most come first. */
export const AVAILABILITY_GROUP_ORDER: readonly AvailabilityStatus[] = [
  "injured",
  "doubtful",
  "suspended",
  "unavailable",
  "not-eligible",
];

/**
 * Every player FPL flags, grouped by status in AVAILABILITY_GROUP_ORDER, each
 * group most-owned first. An "available" player with a chance below 100% is
 * doubtful (as on the players table). Empty groups are left out.
 */
export function buildAvailability(bootstrap: HubBootstrap): AvailabilityGroup[] {
  const toPlayer = hubPlayers(bootstrap);
  const groups = new Map<AvailabilityStatus, AvailabilityRow[]>();

  for (const e of [...bootstrap.elements].sort(byOwnership)) {
    const player = toPlayer(e);
    const a = player.availability;
    if (!a) continue;
    const rows = groups.get(a.status) ?? [];
    rows.push({ ...player, chance: a.chance, news: a.news.trim(), newsAdded: e.news_added ?? null });
    groups.set(a.status, rows);
  }

  return AVAILABILITY_GROUP_ORDER.flatMap((status) => {
    const players = groups.get(status);
    return players?.length ? [{ status, label: AVAILABILITY_LABELS[status], players }] : [];
  });
}

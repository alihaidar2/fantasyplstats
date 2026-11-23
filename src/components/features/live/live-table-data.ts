// The live players table's rows travel to the browser as compact arrays
// (about a third of the size of objects with named keys), since every player
// who has played is in the page. The server packs them; the table unpacks.

import type { LivePlayerRow } from "@/lib/stats/live";

/** [id, name, fullName, team, positionId, points, provisionalBonus, bonus, minutes, goals, assists, cleanSheets, bps, matches] */
export type PackedLiveRow = [
  number,
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number[],
];

export interface LiveTableRow {
  id: number;
  name: string;
  fullName: string;
  team: string;
  positionId: number;
  points: number;
  provisionalBonus: number;
  bonus: number;
  projected: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bps: number;
  matches: number[];
}

export function packLiveRows(rows: readonly LivePlayerRow[]): PackedLiveRow[] {
  return rows.map((r) => [
    r.id,
    r.name,
    // Only needed for search when it adds something to the short name.
    r.fullName === r.name ? "" : r.fullName,
    r.team,
    r.positionId,
    r.points,
    r.provisionalBonus,
    r.bonus,
    r.minutes,
    r.goals,
    r.assists,
    r.cleanSheets,
    r.bps,
    r.matches,
  ]);
}

export function unpackLiveRows(rows: readonly PackedLiveRow[]): LiveTableRow[] {
  return rows.map(([id, name, fullName, team, positionId, points, provisionalBonus, bonus, minutes, goals, assists, cleanSheets, bps, matches]) => ({
    id,
    name,
    fullName: fullName || name,
    team,
    positionId,
    points,
    provisionalBonus,
    bonus,
    projected: points + provisionalBonus,
    minutes,
    goals,
    assists,
    cleanSheets,
    bps,
    matches,
  }));
}

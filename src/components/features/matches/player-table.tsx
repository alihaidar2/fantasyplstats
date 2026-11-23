"use client";

// The match page's player table (BPS, bonus, defensive contributions). A
// client component only to keep the page small: there's a page per match (up
// to 380), and Next.js writes a page's server-rendered content into its
// payload several times over, so the rows come in as compact tuples (about a
// tenth of the size of rendered rows) and are drawn here. The first rows are
// in the HTML; "Show all" draws the rest.

import { useState } from "react";
import { playerPath } from "@/lib/site";

/** [player id, name, 0 home / 1 away, BPS rank, BPS, bonus, defensive contributions] */
export type PlayerTuple = [number, string, 0 | 1, number, number, number, number];

const TABLE =
  "w-full table-fixed text-sm tabular-nums [&_td]:truncate [&_td]:py-1.5 [&_td:first-child]:text-gray-500 [&_td:nth-child(n+3)]:text-right " +
  "[&_a]:font-medium [&_a]:text-emerald-700 [&_a:hover]:underline dark:[&_a]:text-emerald-300 [&_small]:ml-1 [&_small]:text-xs [&_small]:text-gray-500";

export default function PlayerTable({
  rows,
  clubs,
  visible = 10,
}: Readonly<{ rows: PlayerTuple[]; clubs: [string, string]; visible?: number }>) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, visible);
  return (
    <>
      <table className={TABLE} id="player-table">
        <caption className="sr-only">Players by BPS, highest first, with their bonus points and defensive contributions</caption>
        <colgroup>
          <col className="w-8" />
          <col />
          <col className="w-12" />
          <col className="w-14" />
          <col className="w-16" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400 [&_th]:py-1.5 [&_th]:font-semibold [&_th:nth-child(n+3)]:text-right">
            <th scope="col" className="text-left">
              <abbr title="BPS rank" className="no-underline">
                #
              </abbr>
            </th>
            <th scope="col" className="text-left">
              Player
            </th>
            <th scope="col">BPS</th>
            <th scope="col">Bonus</th>
            <th scope="col">
              <abbr title="Defensive contributions" className="no-underline">
                DefCon
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {shown.map(([id, name, side, rank, bps, bonus, dc]) => (
            <tr key={id}>
              <td>{rank}</td>
              <td>
                <a href={playerPath(id)}>{name}</a> <small>{clubs[side]}</small>
              </td>
              <td className="font-semibold">{bps}</td>
              <td>{bonus || ""}</td>
              <td>{dc || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > visible && (
        <button
          type="button"
          aria-expanded={all}
          aria-controls="player-table"
          onClick={() => setAll((v) => !v)}
          className="py-2 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
        >
          {all ? "Show fewer" : `Show all ${rows.length} players`}
        </button>
      )}
    </>
  );
}

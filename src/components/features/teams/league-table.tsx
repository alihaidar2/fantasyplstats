// The Premier League table. A server component: a plain, scrollable table
// with the club column pinned, so it ships no client JavaScript.

import { formatNumber, formatSigned } from "@/components/features/players/player-format";
import { cn } from "@/lib/utils";
import { XGC_UNAVAILABLE_LABELS, type TableRow } from "@/lib/stats/teams";
import { ClubBadge, ClubLink, FormGuide } from "./team-bits";

const th = "px-2 py-2 text-right font-semibold whitespace-nowrap";
const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
const sticky = "sticky left-0 z-10 bg-white dark:bg-gray-900";

function Abbr({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <abbr title={title} className="no-underline">
      {children}
    </abbr>
  );
}

function XgcCells({ row }: { row: TableRow }) {
  if (!row.xgc.available) {
    const why = XGC_UNAVAILABLE_LABELS[row.xgc.reason];
    return (
      <>
        <td className={cn(td, "text-gray-400 dark:text-gray-500")} title={why}>
          <span aria-hidden>—</span>
          <span className="sr-only">{why}</span>
        </td>
        <td className={cn(td, "text-gray-400 dark:text-gray-500")} aria-hidden>
          —
        </td>
      </>
    );
  }
  const diff = Math.round((row.goalsAgainst - row.xgc.value) * 100) / 100;
  return (
    <>
      <td className={td}>{formatNumber(row.xgc.value, 1)}</td>
      <td
        className={cn(
          td,
          diff < 0 ? "text-green-700 dark:text-green-400" : diff > 0 ? "text-red-700 dark:text-red-400" : "",
        )}
      >
        {formatSigned(diff, 1)}
      </td>
    </>
  );
}

export default function LeagueTable({ rows }: { rows: readonly TableRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm text-gray-800 dark:text-gray-200">
        <caption className="sr-only">
          Premier League table: position, club, played, won, drawn, lost, goals for and against, goal difference,
          points, form, clean sheets and expected goals conceded
        </caption>
        <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" className={cn(th, sticky, "w-10 text-right")}>
              <Abbr title="Position">Pos</Abbr>
            </th>
            <th scope="col" className={cn(th, sticky, "left-10 text-left")}>
              Club
            </th>
            <th scope="col" className={th}>
              <Abbr title="Played">P</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Won">W</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Drawn">D</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Lost">L</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Goals for">GF</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Goals against">GA</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Goal difference">GD</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Points">Pts</Abbr>
            </th>
            <th scope="col" className={cn(th, "text-left")}>
              Form
            </th>
            <th scope="col" className={th}>
              <Abbr title="Clean sheets">CS</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Expected goals conceded">xGC</Abbr>
            </th>
            <th scope="col" className={th}>
              <Abbr title="Goals against minus expected goals conceded (negative: conceding fewer than expected)">
                GA−xGC
              </Abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.club.id}
              className="border-b border-gray-100 last:border-0 hover:bg-emerald-50/60 dark:border-gray-800 dark:hover:bg-gray-800/60"
            >
              <td className={cn(td, sticky, "w-10 font-semibold")}>
                {row.shared ? <span title="Level on points, goal difference and goals scored">{row.position}=</span> : row.position}
              </td>
              <th scope="row" className={cn(sticky, "left-10 px-2 py-2 text-left font-medium")}>
                <ClubLink club={row.club} className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <ClubBadge code={row.club.code} />
                  <span className="hidden sm:inline">{row.club.name}</span>
                  <span className="sm:hidden" title={row.club.name}>
                    {row.club.shortName}
                  </span>
                </ClubLink>
              </th>
              <td className={td}>{row.played}</td>
              <td className={td}>{row.won}</td>
              <td className={td}>{row.drawn}</td>
              <td className={td}>{row.lost}</td>
              <td className={td}>{row.goalsFor}</td>
              <td className={td}>{row.goalsAgainst}</td>
              <td className={td}>{formatSigned(row.goalDifference)}</td>
              <td className={cn(td, "font-bold text-gray-900 dark:text-white")}>{row.points}</td>
              <td className="px-2 py-2">
                <FormGuide form={row.form} />
              </td>
              <td className={td}>{row.cleanSheets}</td>
              <XgcCells row={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

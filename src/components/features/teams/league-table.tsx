// The Premier League table. A server component: a plain, scrollable table
// with the club column pinned, so it ships no client JavaScript.

import { formatNumber, formatSigned } from "@/components/features/players/player-format";
import { cn } from "@/lib/utils";
import { XGC_UNAVAILABLE_LABELS, type TableRow } from "@/lib/stats/teams";
import { ClubBadge, ClubLink, FormGuide } from "./team-bits";

// Cell styles live on the table (descendant selectors) rather than on each of
// the ~300 cells, which keeps the page's HTML and RSC payload small.
const tableClass =
  "w-full min-w-max border-collapse text-sm text-gray-800 dark:text-gray-200 " +
  "[&_th]:px-2 [&_th]:py-2 [&_th]:whitespace-nowrap [&_td]:px-2 [&_td]:py-2 [&_td]:text-right [&_td]:tabular-nums [&_td]:whitespace-nowrap " +
  "[&_thead_th]:text-right [&_thead_th]:font-semibold " +
  "[&_tr>:nth-child(-n+2)]:sticky [&_tr>:nth-child(-n+2)]:z-10 [&_tr>:nth-child(-n+2)]:bg-white dark:[&_tr>:nth-child(-n+2)]:bg-gray-900 " +
  // Phones skip W, D, L, GF and GA (columns 4–8) so points fit on screen; the club pages have them.
  "[&_tr>:nth-child(n+4):nth-child(-n+8)]:hidden sm:[&_tr>:nth-child(n+4):nth-child(-n+8)]:table-cell " +
  "[&_tr>:first-child]:left-0 [&_tr>:first-child]:w-12 [&_tr>:first-child]:min-w-12 [&_tr>:nth-child(2)]:left-12 [&_tr>:nth-child(2)]:text-left";
const muted = "text-gray-400 dark:text-gray-500";

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
        <td className={muted} title={why} aria-label="Not available">
          —
        </td>
        <td className={muted} title={why} aria-label="Not available">
          —
        </td>
      </>
    );
  }
  const diff = Math.round((row.goalsAgainst - row.xgc.value) * 100) / 100;
  return (
    <>
      <td>{formatNumber(row.xgc.value, 1)}</td>
      <td
        className={cn(
          diff < 0 ? "text-green-700 dark:text-green-400" : diff > 0 ? "text-red-700 dark:text-red-400" : undefined,
        )}
      >
        {formatSigned(diff, 1)}
      </td>
    </>
  );
}

export default function LeagueTable({ rows }: { rows: readonly TableRow[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className={tableClass}>
        <caption className="sr-only">
          Premier League table: position, club, played, won, drawn, lost, goals for and against, goal difference,
          points, form, clean sheets and expected goals conceded
        </caption>
        <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col">
              <Abbr title="Position">Pos</Abbr>
            </th>
            <th scope="col">
              Club
            </th>
            <th scope="col">
              <Abbr title="Played">P</Abbr>
            </th>
            <th scope="col">
              <Abbr title="Won">W</Abbr>
            </th>
            <th scope="col">
              <Abbr title="Drawn">D</Abbr>
            </th>
            <th scope="col">
              <Abbr title="Lost">L</Abbr>
            </th>
            <th scope="col">
              <Abbr title="Goals for">GF</Abbr>
            </th>
            <th scope="col">
              <Abbr title="Goals against">GA</Abbr>
            </th>
            <th scope="col">
              <Abbr title="Goal difference">GD</Abbr>
            </th>
            <th scope="col">
              <Abbr title="Points">Pts</Abbr>
            </th>
            <th scope="col" className="text-left!">
              Form
            </th>
            <th scope="col">
              <Abbr title="Clean sheets">CS</Abbr>
            </th>
            <th scope="col">
              <span className="normal-case">
                <Abbr title="Expected goals conceded">xGC</Abbr>
              </span>
            </th>
            <th scope="col">
              <span className="normal-case">
                <Abbr title="Goals against minus expected goals conceded (negative: conceding fewer than expected)">
                  GA−xGC
                </Abbr>
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr]:border-b [&_tr]:border-gray-100 [&_tr:last-child]:border-0 dark:[&_tr]:border-gray-800">
          {rows.map((row) => (
            <tr key={row.club.id}>
              <td className="font-semibold">
                {row.shared ? <span title="Level on points, goal difference and goals scored">{row.position}=</span> : row.position}
              </td>
              <th scope="row" className="font-medium">
                <ClubLink club={row.club} className="flex items-center gap-2 text-gray-900 dark:text-white">
                  <ClubBadge code={row.club.code} />
                  <span className="hidden sm:inline">{row.club.name}</span>
                  <span className="sm:hidden" title={row.club.name}>
                    {row.club.shortName}
                  </span>
                </ClubLink>
              </th>
              <td>{row.played}</td>
              <td>{row.won}</td>
              <td>{row.drawn}</td>
              <td>{row.lost}</td>
              <td>{row.goalsFor}</td>
              <td>{row.goalsAgainst}</td>
              <td>{formatSigned(row.goalDifference)}</td>
              <td className="font-bold text-gray-900 dark:text-white">{row.points}</td>
              <td className="text-left!">
                <FormGuide form={row.form} />
              </td>
              <td>{row.cleanSheets}</td>
              <XgcCells row={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

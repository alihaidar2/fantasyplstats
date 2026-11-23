import type { Metadata } from "next";
import Link from "next/link";
import { cardClass, Empty, GameweekStateBadge, linkClass } from "@/components/features/matches/bits";
import SeasonChart from "@/components/features/matches/season-chart";
import { formatCompact, formatNumber } from "@/components/features/players/player-format";
import { getSnapshot } from "@/lib/data";
import { CHIP_LABELS } from "@/lib/recap-pages";
import { PATHS } from "@/lib/site";
import {
  buildGameweekSummaries,
  firstDeadline,
  gameweekPath,
  gameweeksMetadata,
  MATCHES_PATHS,
  seasonLabel,
  seasonScores,
  type GameweekSummary,
  type PlayerRef,
} from "@/lib/stats/matches";

export const metadata: Metadata = gameweeksMetadata;

/** Chip columns in a fixed order; any chip FPL adds goes after these. */
const CHIP_ORDER = ["wildcard", "freehit", "bboost", "3xc"];
const CHIP_SHORT: Record<string, string> = { wildcard: "WC", freehit: "FH", bboost: "BB", "3xc": "TC" };

function chipColumns(summaries: GameweekSummary[]): string[] {
  const seen = new Set(summaries.flatMap((s) => s.chips.map((c) => c.chip)));
  const known = CHIP_ORDER.filter((c) => seen.has(c));
  const other = [...seen].filter((c) => !CHIP_ORDER.includes(c)).sort();
  return [...known, ...other];
}

function Name({ player, points }: { player: PlayerRef | null; points?: number }) {
  if (!player) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  return (
    <Link href={player.path} prefetch={false} className="text-gray-900 hover:underline dark:text-white">
      {player.name}
      {points !== undefined && <span className="ml-1 tabular-nums text-gray-500 dark:text-gray-400">({points})</span>}
    </Link>
  );
}

const th = "px-2 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap";
const td = "px-2 py-1.5 whitespace-nowrap";

export default function GameweeksPage() {
  const snapshot = getSnapshot();
  const summaries = buildGameweekSummaries(snapshot);
  const chart = seasonScores(summaries);
  const chips = chipColumns(summaries);
  const season = seasonLabel(snapshot);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">
          Gameweeks{season ? ` ${season}` : ""}
        </h1>
        <p className="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">
          Every Fantasy Premier League gameweek so far, from FPL&apos;s own figures: average and highest scores, the
          most captained, selected and transferred-in players, and how many managers played each chip. Planning ahead?
          See the{" "}
          <Link href={MATCHES_PATHS.schedule} className={linkClass}>
            double and blank gameweek planner
          </Link>
          .
        </p>
      </header>

      {summaries.length === 0 ? (
        <div className={`${cardClass} p-6 text-center`}>
          <p className="font-medium text-gray-900 dark:text-white">The season hasn&apos;t started yet.</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Gameweek stats appear here from the first deadline
            {firstDeadline(snapshot) ? ` (${firstDeadline(snapshot)})` : ""}. Meanwhile, the{" "}
            <Link href={PATHS.fixtures} className={linkClass}>
              fixture difficulty matrix
            </Link>{" "}
            and the{" "}
            <Link href={MATCHES_PATHS.schedule} className={linkClass}>
              double and blank planner
            </Link>{" "}
            cover the whole season.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="season-scores" className={`${cardClass} p-4 sm:p-5`}>
            <h2 id="season-scores" className="mb-3 text-lg font-bold text-gray-900 dark:text-white">
              Average and highest score
            </h2>
            {chart.length > 1 ? (
              <SeasonChart data={chart} />
            ) : (
              <Empty>The chart appears once two gameweeks have scores.</Empty>
            )}
          </section>

          <section aria-labelledby="by-gameweek" className={`${cardClass} p-2 sm:p-3`}>
            <h2 id="by-gameweek" className="px-2 pt-2 pb-1 text-lg font-bold text-gray-900 dark:text-white">
              Gameweek by gameweek
            </h2>
            <p className="px-2 pb-2 text-xs text-gray-500 dark:text-gray-400">
              Newest first. Top scorer points in brackets.
              {chips.length > 0 &&
                ` Chips played: ${chips.map((c) => `${CHIP_SHORT[c] ?? c} = ${CHIP_LABELS[c] ?? c}`).join(", ")}.`}{" "}
              Select a gameweek for its results and team of the week.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">FPL stats for every gameweek that has started</caption>
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th scope="col" className={`${th} sticky left-0 bg-white dark:bg-gray-800`}>GW</th>
                    <th scope="col" className={`${th} text-right`}>Average</th>
                    <th scope="col" className={`${th} text-right`}>Highest</th>
                    <th scope="col" className={th}>Top scorer</th>
                    <th scope="col" className={th}>Captain</th>
                    <th scope="col" className={th}>Vice</th>
                    <th scope="col" className={th}>Most selected</th>
                    <th scope="col" className={th}>Most transferred in</th>
                    <th scope="col" className={`${th} text-right`}>Transfers</th>
                    {chips.map((c) => (
                      <th key={c} scope="col" className={`${th} text-right`}>
                        <abbr title={CHIP_LABELS[c] ?? c} className="no-underline">
                          {CHIP_SHORT[c] ?? c}
                        </abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {summaries.map((s) => {
                    const played = new Map(s.chips.map((c) => [c.chip, c.played]));
                    return (
                      <tr key={s.gameweek} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                        <th scope="row" className={`${td} sticky left-0 bg-white text-left dark:bg-gray-800`}>
                          <Link href={gameweekPath(s.gameweek)} prefetch={false} className={`${linkClass} font-semibold`}>
                            GW{s.gameweek}
                          </Link>
                          {s.state === "in-progress" && (
                            <span className="ml-2 align-middle">
                              <GameweekStateBadge state={s.state} />
                            </span>
                          )}
                        </th>
                        <td className={`${td} text-right tabular-nums text-gray-900 dark:text-white`}>
                          {s.averageScore ?? "—"}
                        </td>
                        <td className={`${td} text-right tabular-nums text-gray-900 dark:text-white`}>
                          {s.highestScore ?? "—"}
                        </td>
                        <td className={td}>
                          <Name player={s.topScorer} points={s.topScorer?.points} />
                        </td>
                        <td className={td}>
                          <Name player={s.mostCaptained} />
                        </td>
                        <td className={td}>
                          <Name player={s.mostViceCaptained} />
                        </td>
                        <td className={td}>
                          <Name player={s.mostSelected} />
                        </td>
                        <td className={td}>
                          <Name player={s.mostTransferredIn} />
                        </td>
                        <td
                          className={`${td} text-right tabular-nums text-gray-900 dark:text-white`}
                          title={s.transfersMade === null ? undefined : formatNumber(s.transfersMade)}
                        >
                          {s.transfersMade === null ? "—" : formatCompact(s.transfersMade)}
                        </td>
                        {chips.map((c) => (
                          <td
                            key={c}
                            className={`${td} text-right tabular-nums text-gray-900 dark:text-white`}
                            title={played.has(c) ? `${formatNumber(played.get(c)!)} ${CHIP_LABELS[c] ?? c}` : undefined}
                          >
                            {played.has(c) ? formatCompact(played.get(c)!) : "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

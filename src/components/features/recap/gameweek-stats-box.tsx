import Link from "next/link";
import { BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/components/features/players/player-format";
import type { GameweekStats, PlayerRef } from "@/lib/recap-pages";
import { gameweekPath } from "@/lib/site";

function PlayerLink({ player }: { player: PlayerRef }) {
  return (
    <Link
      href={player.path}
      prefetch={false}
      className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
    >
      {player.name}
      <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">{player.team}</span>
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold text-gray-900 dark:text-white">{children}</dd>
    </div>
  );
}

/** The gameweek's numbers from FPL itself (the snapshot's `events`), shown beside a recap. */
export default function GameweekStatsBox({ stats, className }: { stats: GameweekStats; className?: string }) {
  return (
    <Card
      className={`gap-3 rounded-xl border border-green-200 bg-white/90 py-4 shadow-sm dark:border-green-900 dark:bg-gray-800/80 ${className ?? ""}`}
    >
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
          <BarChart2 className="h-4 w-4" aria-hidden />
          Gameweek {stats.gameweek} in numbers
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <dl className="divide-y divide-gray-100 dark:divide-gray-700">
          <Row label="Average score">{formatNumber(stats.averageScore)} pts</Row>
          {stats.highestScore != null && <Row label="Highest score">{formatNumber(stats.highestScore)} pts</Row>}
          {stats.topScorer && (
            <Row label="Top scorer">
              <PlayerLink player={stats.topScorer} />{" "}
              <span className="whitespace-nowrap">({stats.topScorer.points} pts)</span>
            </Row>
          )}
          {stats.mostCaptained && (
            <Row label="Most captained">
              <PlayerLink player={stats.mostCaptained} />
            </Row>
          )}
          {stats.chips.length > 0 && (
            <div className="py-1.5">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Chips played</dt>
              <dd className="mt-1">
                <ul className="space-y-0.5">
                  {stats.chips.map((c) => (
                    <li key={c.chip} className="flex justify-between gap-3 text-sm text-gray-900 dark:text-white">
                      <span>{c.label}</span>
                      <span className="font-semibold tabular-nums">{formatNumber(c.played)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
        {/* Stats only exist for a played gameweek of the snapshot's season, which always has a page. */}
        <Link
          href={gameweekPath(stats.gameweek)}
          prefetch={false}
          className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
        >
          Results and team of the week
        </Link>
      </CardContent>
    </Card>
  );
}

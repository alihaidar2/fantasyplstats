import Link from "next/link";
import { formatNumber } from "@/components/features/players/player-format";
import type { GameweekSummary, PlayerRef } from "@/lib/stats/matches";
import { SectionCard } from "./bits";

function Player({ player, suffix }: { player: PlayerRef | null; suffix?: string }) {
  if (!player) return <span className="text-gray-500 dark:text-gray-400">—</span>;
  return (
    <>
      <Link href={player.path} prefetch={false} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
        {player.name}
      </Link>{" "}
      <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">{player.team}</span>
      {suffix && " "}
      {suffix && <span className="ml-1 whitespace-nowrap">{suffix}</span>}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-1.5 dark:border-gray-700">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold text-gray-900 dark:text-white">{children}</dd>
    </div>
  );
}

/** FPL's own numbers for one gameweek (bootstrap `events`). */
export default function GameweekNumbers({ summary }: { summary: GameweekSummary }) {
  const pts = (n: number | null) => (n === null ? "—" : `${formatNumber(n)} pts`);
  return (
    <SectionCard
      id="gameweek-numbers"
      title="In numbers"
      aside={
        summary.state === "in-progress" ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">Live: these change until the gameweek ends</span>
        ) : undefined
      }
    >
      <dl className="grid gap-x-8 md:grid-cols-2">
        <Item label="Average score">{pts(summary.averageScore)}</Item>
        <Item label="Highest score">{pts(summary.highestScore)}</Item>
        <Item label="Top scorer">
          <Player player={summary.topScorer} suffix={summary.topScorer ? `(${summary.topScorer.points} pts)` : undefined} />
        </Item>
        <Item label="Most captained">
          <Player player={summary.mostCaptained} />
        </Item>
        <Item label="Most vice-captained">
          <Player player={summary.mostViceCaptained} />
        </Item>
        <Item label="Most selected">
          <Player player={summary.mostSelected} />
        </Item>
        <Item label="Most transferred in">
          {summary.gameweek === 1 ? <span className="font-normal text-gray-500 dark:text-gray-400">No transfers before GW1</span> : <Player player={summary.mostTransferredIn} />}
        </Item>
        <Item label="Transfers made">{summary.transfersMade === null ? "—" : formatNumber(summary.transfersMade)}</Item>
        <Item label="Matches played">
          {summary.matches.played} of {summary.matches.total}
        </Item>
      </dl>
      <h3 className="mt-4 mb-1 text-sm font-semibold text-gray-900 dark:text-white">Chips played</h3>
      {summary.chips.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None recorded.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.chips.map((c) => (
            <li key={c.chip} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
              <span className="block text-xs text-gray-500 dark:text-gray-400">{c.label}</span>
              <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white">{formatNumber(c.played)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

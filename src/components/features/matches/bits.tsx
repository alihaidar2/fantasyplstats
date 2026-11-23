// Small server-rendered pieces shared by the gameweek, match and planner pages.

import Link from "next/link";
import type { GameweekState, MatchState } from "@/lib/stats/matches";
import { badgeUrl, GAMEWEEK_STATE_LABELS, type TeamRef } from "@/lib/stats/matches";
import { playerPath } from "@/lib/site";

export const cardClass =
  "rounded-xl border border-green-200 bg-white/90 shadow-sm dark:border-green-900 dark:bg-gray-800/80";

export const linkClass = "font-medium text-emerald-700 hover:underline dark:text-emerald-300";

export function SectionCard({
  id,
  title,
  aside,
  children,
  className = "",
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`${cardClass} p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="text-lg font-bold text-gray-900 dark:text-white">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A player's name linking to their page. Not prefetched: a page can list dozens. */
export function PlayerLink({ id, name, className = "" }: { id: number; name: string; className?: string }) {
  return (
    <Link href={playerPath(id)} prefetch={false} className={`${linkClass} ${className}`}>
      {name}
    </Link>
  );
}

/** A club badge. Decorative: the club's name is always next to it. */
export function TeamBadge({ team, size = 24 }: { team: TeamRef; size?: number }) {
  if (!team.code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export: no image optimizer
    <img src={badgeUrl(team.code)} alt="" width={size} height={size} loading="lazy" className="shrink-0" />
  );
}

const pill = "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap";

const MATCH_STATE: Record<MatchState, { label: string; className: string }> = {
  finished: { label: "Full time", className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200" },
  provisional: {
    label: "Provisional",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  },
  live: { label: "Live", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  upcoming: { label: "Not started", className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
  postponed: { label: "Postponed", className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
};

export function MatchStateBadge({ state, minutes }: { state: MatchState; minutes?: number }) {
  const { label, className } = MATCH_STATE[state];
  return (
    <span className={`${pill} ${className}`}>
      {state === "live" && minutes ? `Live, ${minutes}'` : label}
    </span>
  );
}

const GAMEWEEK_STATE_CLASS: Record<GameweekState, string> = {
  settled: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  finished: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  "in-progress": "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  upcoming: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

export function GameweekStateBadge({ state }: { state: GameweekState }) {
  return <span className={`${pill} ${GAMEWEEK_STATE_CLASS[state]}`}>{GAMEWEEK_STATE_LABELS[state]}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 dark:text-gray-400">{children}</p>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { linkClass } from "@/components/features/matches/bits";
import { MatchStats, PlayerTable, Scoreboard } from "@/components/features/matches/match-view";
import { getSnapshot } from "@/lib/data";
import { formatUpdatedAt } from "@/lib/fpl";
import {
  buildMatchPage,
  gameweekPath,
  matchesNotFoundMetadata,
  MATCHES_PATHS,
  matchMetadata,
  matchPageIds,
  matchTitle,
  seasonLabel,
} from "@/lib/stats/matches";

// One page per fixture that has kicked off; any other URL is a 404.
export const dynamicParams = false;

// A static export refuses a dynamic route with no params, so before the first
// kickoff the route gets one placeholder ("0"), which renders the not-found page.
export function generateStaticParams() {
  const ids = matchPageIds(getSnapshot());
  return ids.length ? ids.map((id) => ({ id: String(id) })) : [{ id: "0" }];
}

function findMatch(param: string) {
  if (!/^[1-9]\d*$/.test(param)) return null;
  return buildMatchPage(getSnapshot(), Number(param));
}

export async function generateMetadata({ params }: PageProps<"/matches/[id]">): Promise<Metadata> {
  const match = findMatch((await params).id);
  return match ? matchMetadata(match, seasonLabel(getSnapshot())) : matchesNotFoundMetadata;
}

export default async function MatchPage({ params }: PageProps<"/matches/[id]">) {
  const match = findMatch((await params).id);
  if (!match) notFound();
  const snapshot = getSnapshot();
  const season = seasonLabel(snapshot);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <Link
        href={match.gameweek ? gameweekPath(match.gameweek) : MATCHES_PATHS.gameweeks}
        className={`inline-flex w-fit items-center gap-1 text-sm ${linkClass}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {match.gameweek ? `Gameweek ${match.gameweek}` : "All gameweeks"}
      </Link>

      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          {[season, match.gameweek ? `Gameweek ${match.gameweek}` : null].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">{matchTitle(match)}</h1>
      </header>

      <Scoreboard match={match} updated={formatUpdatedAt(snapshot.generatedAt)} />
      <MatchStats match={match} />
      <PlayerTable match={match} />
    </div>
  );
}

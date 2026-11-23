import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Empty, GameweekStateBadge, linkClass, SectionCard } from "@/components/features/matches/bits";
import GameweekNumbers from "@/components/features/matches/gameweek-numbers";
import ResultsList from "@/components/features/matches/results-list";
import TeamOfTheWeek from "@/components/features/matches/team-of-the-week";
import { getSnapshot } from "@/lib/data";
import { PATHS } from "@/lib/site";
import {
  buildGameweekPage,
  gameweekMetadata,
  gameweekPath,
  matchesNotFoundMetadata,
  MATCHES_PATHS,
  seasonLabel,
  startedGameweeks,
} from "@/lib/stats/matches";

// One page per gameweek that has started; any other URL is a 404.
export const dynamicParams = false;

// A static export refuses a dynamic route with no params, so before the season
// starts the route gets one placeholder ("0"), which renders the not-found page.
export function generateStaticParams() {
  const { bootstrap, fixtures } = getSnapshot();
  const started = startedGameweeks(bootstrap.events, fixtures);
  return started.length ? started.map((gw) => ({ gw: String(gw) })) : [{ gw: "0" }];
}

function findPage(param: string) {
  if (!/^[1-9]\d?$/.test(param)) return null;
  return buildGameweekPage(getSnapshot(), Number(param));
}

export async function generateMetadata({ params }: PageProps<"/gameweeks/[gw]">): Promise<Metadata> {
  const page = findPage((await params).gw);
  return page ? gameweekMetadata(page.summary, seasonLabel(getSnapshot())) : matchesNotFoundMetadata;
}

function Neighbour({ gameweek, direction }: { gameweek: number; direction: "previous" | "next" }) {
  const previous = direction === "previous";
  return (
    <Link
      href={gameweekPath(gameweek)}
      rel={previous ? "prev" : "next"}
      className={`inline-flex items-center gap-1 text-sm ${linkClass}`}
    >
      {previous && <ArrowLeft className="h-4 w-4" aria-hidden />}
      Gameweek {gameweek}
      {!previous && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Link>
  );
}

export default async function GameweekPage({ params }: PageProps<"/gameweeks/[gw]">) {
  const page = findPage((await params).gw);
  if (!page) notFound();
  const { summary, results, teamOfTheWeek, previous, next } = page;
  const season = seasonLabel(getSnapshot());

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <Link href={MATCHES_PATHS.gameweeks} className={`inline-flex w-fit items-center gap-1 text-sm ${linkClass}`}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All gameweeks
      </Link>

      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          {season ? `${season} · ` : ""}Fantasy Premier League
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">Gameweek {summary.gameweek}</h1>
          <GameweekStateBadge state={summary.state} />
        </div>
        {summary.deadline && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Deadline {summary.deadline}</p>
        )}
        {getSnapshot().live?.gameweek === summary.gameweek && summary.state !== "settled" && (
          <p className="mt-1 text-sm">
            <Link href={PATHS.live} className={linkClass}>
              Live points for this gameweek
            </Link>
          </p>
        )}
      </header>

      <GameweekNumbers summary={summary} />

      <SectionCard id="results" title="Results">
        <ResultsList matches={results} />
      </SectionCard>

      <SectionCard id="team-of-the-week" title="Team of the week">
        {teamOfTheWeek ? (
          <TeamOfTheWeek team={teamOfTheWeek} />
        ) : (
          <Empty>
            The team of the week appears once FPL settles the gameweek: after the last match, when bonus points are
            confirmed and FPL has checked the data.
          </Empty>
        )}
      </SectionCard>

      {(previous || next) && (
        <nav aria-label="Other gameweeks" className="flex justify-between gap-3">
          {previous ? <Neighbour gameweek={previous} direction="previous" /> : <span />}
          {next ? <Neighbour gameweek={next} direction="next" /> : <span />}
        </nav>
      )}
    </div>
  );
}

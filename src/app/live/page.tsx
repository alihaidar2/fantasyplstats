import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Info, Trophy } from "lucide-react";
import { LivePlayersTable } from "@/components/features/live/live-players-table";
import { MatchCard } from "@/components/features/live/match-card";
import {
  cardClass,
  Freshness,
  LIVE_PATHS,
  linkClass,
  PlayerLink,
  SectionHeading,
} from "@/components/features/live/shared";
import { getSnapshot } from "@/lib/data";
import { nextDeadline } from "@/lib/home";
import { pageMetadata } from "@/lib/metadata";
import { PATHS } from "@/lib/site";
import { bonusCheck, buildLivePage, dayPointsLabel, type LiveDay, type LivePage } from "@/lib/stats/live";

const TOP_SCORERS = 10;

export function generateMetadata(): Metadata {
  const page = buildLivePage(getSnapshot());
  return pageMetadata({
    title: page ? `FPL live points: Gameweek ${page.gameweek}` : "FPL live gameweek points",
    description: page
      ? `Fantasy Premier League Gameweek ${page.gameweek} live points: top scorers so far, provisional bonus from BPS in every match, and every player's points, minutes, goals, assists and BPS.`
      : "Fantasy Premier League live gameweek points with provisional bonus from BPS, updated through every match day.",
    path: LIVE_PATHS.live,
  });
}

function DayStatus({ status }: { status: LiveDay["status"] }) {
  if (!status) return null;
  return (
    <span className="flex flex-wrap gap-2 text-xs font-medium">
      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
        {dayPointsLabel(status.points)}
      </span>
      <span
        className={`rounded-md px-2 py-0.5 ${
          status.bonus_added
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
            : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        }`}
      >
        {status.bonus_added ? "Bonus added" : "Bonus not added yet"}
      </span>
    </span>
  );
}

function Summary({ page }: { page: LivePage }) {
  const { counts } = page;
  const items: [string, number][] = [
    ["Confirmed", counts.confirmed],
    ["Full time, provisional", counts.finished],
    ["Live", counts.live],
    ["To play", counts.upcoming],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {[...items, ["Goals", page.goals] as [string, number]].map(([label, value]) => (
        <div key={label} className={`${cardClass} p-3`}>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
          <dd className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TopScorers({ page }: { page: LivePage }) {
  const top = page.players.slice(0, TOP_SCORERS);
  return (
    <section aria-labelledby="top-scorers" className={`${cardClass} p-4`}>
      <h2 id="top-scorers" className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
        <Trophy className="h-4 w-4" aria-hidden />
        Top scorers so far
      </h2>
      <ol className="space-y-1.5">
        {top.map((p, i) => (
          <li key={p.id} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 text-right tabular-nums text-gray-500 dark:text-gray-400">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              <PlayerLink id={p.id} name={p.name} />
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                {p.team} · {p.position}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-bold tabular-nums text-gray-900 dark:text-white">{p.projected}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400"> pts</span>
              {p.provisionalBonus > 0 && (
                <span className="block text-xs text-amber-700 dark:text-amber-300">
                  incl. {p.provisionalBonus} provisional bonus
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NoGameweek() {
  const deadline = nextDeadline(getSnapshot().bootstrap.events);
  return (
    <div className={`${cardClass} p-6 text-center`}>
      <CalendarClock className="mx-auto h-8 w-8 text-emerald-700 dark:text-emerald-300" aria-hidden />
      <p className="mt-2 font-medium text-gray-900 dark:text-white">No gameweek is in progress.</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {deadline ? (
          <>
            Live points start once Gameweek {deadline.gameweek} kicks off (deadline{" "}
            <time dateTime={deadline.time}>{deadline.label}</time>).
          </>
        ) : (
          "The season is over. Live points return when the next season starts."
        )}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
        <Link href={PATHS.fixtures} className={linkClass}>
          Fixture difficulty
        </Link>
        <Link href={LIVE_PATHS.points} className={linkClass}>
          How FPL points work
        </Link>
      </div>
    </div>
  );
}

export default function LivePointsPage() {
  const snapshot = getSnapshot();
  const page = buildLivePage(snapshot);
  const started = page ? page.matches.length - page.counts.upcoming : 0;
  const hasProvisional = page?.players.some((p) => p.provisionalBonus > 0) ?? false;
  const check = bonusCheck(snapshot.fixtures);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header>
        {page && (
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Gameweek {page.gameweek}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">Live gameweek points</h1>
        <p className="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">
          Every player&apos;s points so far, with provisional bonus worked out from each match&apos;s BPS until FPL
          adds the real thing. New to the scoring?{" "}
          <Link href={LIVE_PATHS.points} className={linkClass}>
            See how FPL points work
          </Link>
          .
        </p>
      </header>

      <Freshness generatedAt={snapshot.generatedAt} />

      {!page ? (
        <NoGameweek />
      ) : (
        <>
          <Summary page={page} />

          {started === 0 && (
            <p className={`${cardClass} p-4 text-gray-700 dark:text-gray-300`}>
              Gameweek {page.gameweek} hasn&apos;t kicked off yet
              {page.matches[0]?.kickoff && (
                <>
                  : the first match is {page.matches[0].label} on {page.days[0].label} at {page.matches[0].kickoffLabel}{" "}
                  UK time
                </>
              )}
              . Points appear here after the next update once it starts.
            </p>
          )}

          {started > 0 && page.players.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
              <TopScorers page={page} />
              <section aria-labelledby="all-players" className={`${cardClass} min-w-0 p-4`}>
                <h2 id="all-players" className="mb-3 text-base font-bold text-gray-900 dark:text-white">
                  Every player who has played
                </h2>
                <LivePlayersTable
                  players={page.players}
                  matches={page.matches.filter((m) => m.state !== "upcoming").map((m) => ({ id: m.id, label: m.label }))}
                  hasProvisional={hasProvisional}
                />
                {hasProvisional && (
                  <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                    <span className="text-amber-700 dark:text-amber-300">*</span> includes provisional bonus. Proj. is
                    FPL&apos;s live points plus provisional bonus; Pts is FPL&apos;s figure, which only includes bonus once
                    FPL adds it.
                  </p>
                )}
              </section>
            </div>
          )}

          <section aria-labelledby="matches">
            <SectionHeading id="matches">Matches</SectionHeading>
            <div className="flex flex-col gap-6">
              {page.days.map((day) => (
                <section key={day.date ?? "tbc"} aria-labelledby={`day-${day.date ?? "tbc"}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3
                      id={`day-${day.date ?? "tbc"}`}
                      className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                    >
                      {day.label}
                    </h3>
                    <DayStatus status={day.status} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {day.matches.map((m) => (
                      <MatchCard key={m.id} match={m} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </>
      )}

      <aside
        aria-labelledby="about-bonus"
        className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="space-y-2">
          <h2 id="about-bonus" className="font-semibold text-gray-900 dark:text-white">
            How provisional bonus works
          </h2>
          <p>
            In each match, the three players with the highest BPS (bonus points system) score get 3, 2 and 1 bonus
            points. Tied players share the higher award and the next player drops down: two players tied on top both
            get 3 and the next gets 1; a tie for second gives 3, 2 and 2; a tie for third gives 3, 2, 1 and 1.
          </p>
          <p>
            Until FPL adds a match&apos;s bonus (usually about an hour after full time), this page works it out from the
            BPS so far, so it can change while a match is being played.
            {check.matches > 0 && (
              <>
                {" "}
                Checked against every confirmed match this season: it gives exactly FPL&apos;s bonus in {check.agree} of{" "}
                {check.matches}.
              </>
            )}
          </p>
          <p>
            Match states come from FPL: <strong>live</strong> once kicked off, <strong>full time, provisional</strong>{" "}
            at the final whistle, and <strong>confirmed</strong> once FPL has confirmed the result and bonus. The
            labels beside each day are FPL&apos;s own status for that day&apos;s points and bonus.
          </p>
        </div>
      </aside>
    </div>
  );
}

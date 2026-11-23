import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import LeagueTable from "@/components/features/teams/league-table";
import { ClubBadge, sectionCardClass } from "@/components/features/teams/team-bits";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import { PATHS } from "@/lib/site";
import { buildLeagueTable, TEAMS_PATH } from "@/lib/stats/teams";

export const metadata: Metadata = pageMetadata({
  title: "Premier League table and FPL team stats",
  description:
    "The Premier League table rebuilt from every result, with form, clean sheets and expected goals conceded for Fantasy Premier League managers. Click a club for its results, fixtures and top FPL players.",
  path: TEAMS_PATH,
});

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function TeamsPage() {
  const table = buildLeagueTable(getSnapshot());
  const started = table.results > 0;

  const notes: string[] = [];
  if (table.provisional > 0) {
    notes.push(
      `Includes ${plural(table.provisional, "result", "results")} at full time that FPL hasn't confirmed yet.`,
    );
  }
  if (table.inProgress > 0) {
    notes.push(`${plural(table.inProgress, "match was", "matches were")} in progress at the last update and aren't counted yet.`);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col p-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Premier League table</h1>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        Built from every Premier League result in FPL&apos;s data, with clean sheets and expected goals conceded (xGC)
        alongside. Click a club for its results, fixtures and top FPL players.
      </p>

      {started ? (
        <>
          <div className={`${sectionCardClass} p-0 sm:p-2`}>
            <LeagueTable rows={table.rows} />
          </div>

          {notes.length > 0 && (
            <p className="mt-3 flex gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{notes.join(" ")}</span>
            </p>
          )}

          <section aria-labelledby="how-it-works" className="mt-6 max-w-3xl space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <h2 id="how-it-works" className="text-base font-semibold text-gray-900 dark:text-white">
              How the table works
            </h2>
            <p>
              Clubs are ordered by points, then goal difference, then goals scored, as in the Premier League&apos;s
              rules. During the season, clubs level on all three share a position (shown as &ldquo;4=&rdquo;) and are
              listed alphabetically. Once every club has played 38 games, clubs still level are separated by points and
              then away goals in the games between them; a play-off, the last tie-breaker, isn&apos;t something this
              site can predict.
            </p>
            <p>
              <strong className="font-semibold text-gray-800 dark:text-gray-200">Clean sheets</strong> are games in
              which the club conceded nothing.{" "}
              <strong className="font-semibold text-gray-800 dark:text-gray-200">xGC</strong> is the expected goals
              conceded by the club&apos;s goalkeepers added together: FPL counts xGC only while a player is on the
              pitch, and exactly one keeper is on it at a time. It is shown only when the keepers&apos; goals conceded
              match the club&apos;s goals against (it isn&apos;t when an outfield player has gone in goal, a keeper has
              moved between Premier League clubs this season, or the club is mid-match).{" "}
              <strong className="font-semibold text-gray-800 dark:text-gray-200">GA−xGC</strong> below zero means the
              club has conceded fewer goals than its chances against suggest.
            </p>
          </section>
        </>
      ) : (
        <div className={`${sectionCardClass} text-center`}>
          <p className="font-medium text-gray-900 dark:text-white">The season hasn&apos;t kicked off yet.</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            The table will fill in as results come in. Until then, here are the clubs, or plan ahead with the{" "}
            <Link href={PATHS.fixtures} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
              fixture difficulty matrix
            </Link>
            .
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
            {table.rows.map(({ club }) => (
              <li key={club.id}>
                <Link
                  href={club.path}
                  prefetch={false}
                  className="flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-gray-900 hover:bg-emerald-50 dark:text-white dark:hover:bg-gray-700"
                >
                  <ClubBadge code={club.code} />
                  {club.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { PointsTable } from "@/components/features/live/points-table";
import {
  cardClass,
  LIVE_PATHS,
  linkClass,
  PlayerLink,
  Points,
  SectionHeading,
} from "@/components/features/live/shared";
import { formatUpdatedAt } from "@/lib/fpl";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import { bonusCheck } from "@/lib/stats/live";
import { buildPointsPage, POSITION_IDS, type PointsPage, type RuleRow } from "@/lib/stats/live-points";

export const metadata: Metadata = pageMetadata({
  title: "How FPL points work",
  description:
    "How Fantasy Premier League scores players, worked out from the points FPL actually awarded this season: goals, assists, clean sheets, saves, defensive contributions, cards and bonus, by position.",
  path: LIVE_PATHS.points,
});

const POSITION_NAMES = { 1: "goalkeepers", 2: "defenders", 3: "midfielders", 4: "forwards" } as const;

/** Rules the data only bounds: thresholds seen as a range, or several fits. */
function openQuestions(rows: RuleRow[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const p of POSITION_IDS) {
      const { rule, detail } = row.cells[p];
      const ranged =
        rule.kind === "every-ambiguous" ||
        rule.kind === "conflict" ||
        (rule.kind === "step" && rule.levels.some((l, i) => i > 0 && l.from !== rule.levels[i - 1].to + 1));
      if (ranged) out.push(`${row.label}, ${POSITION_NAMES[p]}: ${detail}`);
    }
  }
  return out;
}

function cleanSheetText({ from, to }: PointsPage["cleanSheetMinutes"]): string {
  if (from !== null && to !== null && from === to) {
    return `A clean sheet needs at least ${to} minutes on the pitch: every player with one played ${to} or more, and players who played ${to - 1} or fewer in a match their club kept a clean sheet didn't get one.`;
  }
  if (from !== null && to !== null) {
    return `A clean sheet needs somewhere between ${from} and ${to} minutes on the pitch: the fewest minutes seen with one is ${to}, and the most seen without one (in a match the club kept a clean sheet) is ${from - 1}.`;
  }
  if (to !== null) return `The fewest minutes seen with a clean sheet is ${to}.`;
  return "The data doesn't show yet how many minutes a clean sheet needs.";
}

function NoData() {
  return (
    <div className={`${cardClass} p-6 text-center`}>
      <p className="font-medium text-gray-900 dark:text-white">No points have been awarded yet this season.</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        This page is built from the points FPL awards, so it fills in once the first gameweek kicks off.
      </p>
    </div>
  );
}

function Examples({ page }: { page: PointsPage }) {
  if (page.examples.length === 0) return null;
  return (
    <section aria-labelledby="examples">
      <SectionHeading id="examples">Real examples from Gameweek {page.gameweek}</SectionHeading>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {page.examples.map((ex) => (
          <article key={ex.id} aria-labelledby={`example-${ex.id}`} className={`${cardClass} flex flex-col gap-2 p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              {ex.reason}
            </p>
            <h3 id={`example-${ex.id}`} className="text-gray-900 dark:text-white">
              <PlayerLink id={ex.id} name={ex.name} className="font-bold hover:underline" />
              <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                {ex.team} · {ex.position}
              </span>
            </h3>
            {ex.matches.map((m) => (
              <table key={m.fixture} className="w-full text-sm">
                <caption className="pb-1 text-left text-xs text-gray-500 dark:text-gray-400">{m.label}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {m.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-1 text-gray-700 dark:text-gray-300">{line.label}</td>
                      <td className="py-1 text-right">
                        <Points value={line.points} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            <p className="mt-auto flex justify-between border-t border-gray-200 pt-2 font-bold text-gray-900 dark:border-gray-700 dark:text-white">
              <span>Total</span>
              <span className="tabular-nums">{ex.total} pts</span>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function PointsPageRoute() {
  const snapshot = getSnapshot();
  const page = buildPointsPage(snapshot);
  const check = bonusCheck(snapshot.fixtures);
  const open = openQuestions(page.rows);
  const { season } = page;
  const sources = [
    page.gameweek !== null && page.liveLines > 0
      ? `FPL's points breakdown for every player in Gameweek ${page.gameweek} (${page.liveLines.toLocaleString("en-GB")} lines)`
      : null,
    season.rows > 0
      ? `${season.rows.toLocaleString("en-GB")} player appearances in this season's settled gameweeks`
      : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">How FPL points work</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          What each action is worth in Fantasy Premier League, by position. Nothing here is copied from a rule book:
          every number is worked out from the points FPL actually awarded
          {sources.length > 0 && <>, using {sources.join(" and ")}</>}. Where the data doesn&apos;t show a rule yet,
          the table says so instead of guessing.
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Data as of <time dateTime={snapshot.generatedAt}>{formatUpdatedAt(snapshot.generatedAt)}</time>. See it in
          action on the{" "}
          <Link href={LIVE_PATHS.live} className={linkClass}>
            live gameweek page
          </Link>
          .
        </p>
      </header>

      {!page.hasData ? (
        <NoData />
      ) : (
        <>
          <section aria-labelledby="rules">
            <SectionHeading id="rules">Points by action and position</SectionHeading>
            <PointsTable rows={page.rows} />
            <ul className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>
                <strong className="text-gray-800 dark:text-gray-200">+1 per 3</strong> means 1 point for every 3 (so 7
                saves earn 2); <strong className="text-gray-800 dark:text-gray-200">+2 from 10</strong> means 2 points
                once the count reaches 10. The small number is how many times FPL&apos;s data showed it.
              </li>
              <li>
                <strong className="text-gray-800 dark:text-gray-200">0</strong> means it was seen and earned nothing
                (a forward&apos;s clean sheet, say). <strong className="text-gray-800 dark:text-gray-200">Not seen</strong>{" "}
                means no player in that position has done it in the data yet, so there&apos;s no evidence of what it&apos;s
                worth.
              </li>
              <li>
                &ldquo;Inferred&rdquo; values come only from earlier matches: when every other part of a player&apos;s
                score is known, the rest of their total is what that action was worth.
              </li>
            </ul>
          </section>

          <section aria-labelledby="details" className={`${cardClass} space-y-3 p-4 text-sm text-gray-700 dark:text-gray-300`}>
            <h2 id="details" className="text-base font-bold text-gray-900 dark:text-white">
              Details the data shows
            </h2>
            <p>
              <strong className="text-gray-900 dark:text-white">Clean sheets.</strong>{" "}
              {cleanSheetText(page.cleanSheetMinutes)}
            </p>
            <p>
              <strong className="text-gray-900 dark:text-white">Bonus.</strong> The three highest BPS scores in each
              match get 3, 2 and 1 bonus points, with ties sharing the higher award
              {check.matches > 0 && (
                <>
                  {" "}
                  (this rule gives exactly FPL&apos;s bonus in {check.agree} of the {check.matches} confirmed matches so
                  far)
                </>
              )}
              . The{" "}
              <Link href={LIVE_PATHS.live} className={linkClass}>
                live page
              </Link>{" "}
              works it out for matches still being played.
            </p>
            {open.length > 0 && (
              <div>
                <p>
                  <strong className="text-gray-900 dark:text-white">Not pinned down yet.</strong> For these, the data
                  only narrows the rule down:
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {open.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </div>
            )}
            {season.checked > 0 && (
              <p>
                <strong className="text-gray-900 dark:text-white">Checked.</strong> Applied to the{" "}
                {season.checked.toLocaleString("en-GB")} appearances in settled gameweeks where every part of the score
                can be valued, these rules add up to FPL&apos;s total in {season.matched.toLocaleString("en-GB")}.
                {season.matched < season.checked && (
                  <>
                    {" "}
                    The rest are most likely players substituted in stoppage time: FPL counts their minutes as 90, so
                    this check assumes they were on the pitch for every goal.
                  </>
                )}{" "}
                The other {(season.rows - season.checked).toLocaleString("en-GB")} can&apos;t be checked, mostly
                because the data doesn&apos;t say how many goals a substitute&apos;s team conceded while they were on the
                pitch.
              </p>
            )}
          </section>

          <Examples page={page} />
        </>
      )}

      <p className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          FPL can change its scoring between seasons. This page follows whatever the current season&apos;s data shows,
          so it updates itself, but it can only describe what has happened: an action no one has done yet this season
          isn&apos;t in the table.
        </span>
      </p>
    </div>
  );
}

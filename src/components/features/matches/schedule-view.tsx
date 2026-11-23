// The double and blank gameweek planner's sections. Server-rendered: no client JavaScript.

import type { PlannerFixture, PlannerWeek, SchedulePlanner } from "@/lib/stats/matches";
import { cardClass, TeamBadge } from "./bits";

const fixtureText = (f: PlannerFixture) => `${f.opponent} (${f.home ? "H" : "A"})`;

function WeekCard({ week }: { week: PlannerWeek }) {
  const quiet = week.doubles.length === 0 && week.blanks.length === 0;
  return (
    <li className={`${cardClass} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-bold text-gray-900 dark:text-white">Gameweek {week.gameweek}</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {week.matches} match{week.matches === 1 ? "" : "es"}
          {week.deadline ? ` · Deadline ${week.deadline}` : ""}
        </span>
      </div>
      {quiet ? (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Every club plays once.</p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Double ({week.doubles.length})
            </h4>
            {week.doubles.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">None</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {week.doubles.map((d) => (
                  <li key={d.team.id} className="flex flex-wrap items-center gap-x-2">
                    <TeamBadge team={d.team} size={18} />
                    <span className="font-medium text-gray-900 dark:text-white">{d.team.name}</span>
                    <span className="text-gray-600 dark:text-gray-300">{d.fixtures.map(fixtureText).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
              Blank ({week.blanks.length})
            </h4>
            {week.blanks.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">None</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {week.blanks.map((t) => (
                  <li key={t.id} className="flex items-center gap-1.5 text-gray-900 dark:text-white">
                    <TeamBadge team={t} size={18} />
                    {t.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function PlannerWeeks({ planner }: { planner: SchedulePlanner }) {
  const flagged = planner.weeks.filter((w) => w.doubles.length > 0 || w.blanks.length > 0);
  return (
    <section aria-labelledby="by-gameweek">
      <h2 id="by-gameweek" className="mb-1 text-lg font-bold text-gray-900 dark:text-white">
        Doubles and blanks by gameweek
      </h2>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {flagged.length} of the {planner.weeks.length} gameweeks still to come have a double or a blank. Gameweeks
        where every club plays once are left out.
      </p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {flagged.map((w) => (
          <WeekCard key={w.gameweek} week={w} />
        ))}
      </ul>
    </section>
  );
}

const cellClass = (count: number) =>
  count === 0
    ? "bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
    : count > 1
      ? "bg-emerald-600 font-bold text-white dark:bg-emerald-600"
      : "text-gray-400 dark:text-gray-500";

export function PlannerGrid({ planner }: { planner: SchedulePlanner }) {
  return (
    <section aria-labelledby="grid" className={`${cardClass} p-2 sm:p-3`}>
      <h2 id="grid" className="px-2 pt-2 text-lg font-bold text-gray-900 dark:text-white">
        Matches per gameweek
      </h2>
      <p className="px-2 pb-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-block rounded bg-emerald-600 px-1.5 font-bold text-white">2</span> a double,{" "}
        <span className="inline-block rounded bg-gray-300 px-1.5 text-gray-700 dark:bg-gray-700 dark:text-gray-200">0</span> a
        blank, 1 a normal week. Hover over a number for the opponents.
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-center text-xs tabular-nums">
          <caption className="sr-only">Number of matches each club plays in each gameweek still to come</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                Club
              </th>
              {planner.gameweeks.map((gw) => (
                <th key={gw} scope="col" className="min-w-7 px-1 py-1 font-semibold text-gray-600 dark:text-gray-300">
                  <span className="sr-only">Gameweek </span>
                  {gw}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 font-semibold text-gray-600 dark:text-gray-300">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {planner.rows.map((row) => (
              <tr key={row.team.id}>
                <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold whitespace-nowrap text-gray-900 dark:bg-gray-800 dark:text-white">
                  <abbr title={row.team.name} className="no-underline">
                    {row.team.short}
                  </abbr>
                </th>
                {row.weeks.map((week, i) => (
                  <td
                    key={planner.gameweeks[i]}
                    className={`rounded px-1 py-1 ${cellClass(week.length)}`}
                    title={week.length ? week.map(fixtureText).join(", ") : "No match"}
                  >
                    {week.length}
                  </td>
                ))}
                <td className="px-2 py-1 font-semibold text-gray-900 dark:text-white">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

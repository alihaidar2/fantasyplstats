import type { Metadata } from "next";
import Link from "next/link";
import { cardClass, linkClass } from "@/components/features/matches/bits";
import { PlannerGrid, PlannerWeeks } from "@/components/features/matches/schedule-view";
import { getSnapshot } from "@/lib/data";
import { PATHS } from "@/lib/site";
import { buildSchedulePlanner, scheduleMetadata } from "@/lib/stats/matches";

export const metadata: Metadata = scheduleMetadata;

export default function SchedulePage() {
  const planner = buildSchedulePlanner(getSnapshot());
  const { gameweeks, postponed, hasDoublesOrBlanks } = planner;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">Double and blank gameweek planner</h1>
        <p className="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">
          In a double gameweek a club plays twice, so its players can score twice; in a blank it doesn&apos;t play at
          all. This page lists both for every gameweek still to come, from FPL&apos;s current fixture list. For how hard
          each match is, see the{" "}
          <Link href={PATHS.fixtures} className={linkClass}>
            fixture difficulty matrix
          </Link>
          .
        </p>
      </header>

      {gameweeks.length === 0 ? (
        <div className={`${cardClass} p-6`}>
          <p className="font-medium text-gray-900 dark:text-white">Every gameweek has started.</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            There are no gameweeks left to plan for this season. The planner fills in again once FPL publishes next
            season&apos;s fixtures.
          </p>
        </div>
      ) : !hasDoublesOrBlanks ? (
        <div className={`${cardClass} p-6`}>
          <p className="font-medium text-gray-900 dark:text-white">No double or blank gameweeks yet.</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            In FPL&apos;s current fixture list every club plays exactly once in each of the {gameweeks.length} gameweek
            {gameweeks.length === 1 ? "" : "s"} still to come (GW{gameweeks[0]}
            {gameweeks.length > 1 ? `–${gameweeks.at(-1)}` : ""}). Doubles and blanks usually appear when cup ties
            move league matches; they&apos;ll show up here as soon as FPL reschedules a fixture.
          </p>
        </div>
      ) : (
        <>
          <PlannerWeeks planner={planner} />
          <PlannerGrid planner={planner} />
        </>
      )}

      {postponed.length > 0 && (
        <section aria-labelledby="postponed" className={`${cardClass} p-4 sm:p-5`}>
          <h2 id="postponed" className="text-lg font-bold text-gray-900 dark:text-white">
            Postponed, not yet rescheduled
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            These matches have no gameweek yet. When FPL moves one into a gameweek, both clubs usually get a double.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-900 dark:text-white">
            {postponed.map((f) => (
              <li key={f.id}>
                {f.home.name} v {f.away.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

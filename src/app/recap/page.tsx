import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getRecaps } from "@/lib/data";
import { recapArchiveMetadata } from "@/lib/metadata";
import { buildRecapArchive } from "@/lib/recap-pages";
import { PATHS } from "@/lib/site";

export function generateMetadata(): Metadata {
  return recapArchiveMetadata(getRecaps().length);
}

export default function RecapArchivePage() {
  const seasons = buildRecapArchive(getRecaps());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">Gameweek recaps</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        A short recap of every Fantasy Premier League gameweek, written by AI from verified FPL data. Every number
        is checked automatically, and a person reviews each recap before it is published.
      </p>

      {seasons.length === 0 ? (
        <div className="mt-8 rounded-xl border border-green-200 bg-white/90 p-6 text-center shadow-sm dark:border-green-900 dark:bg-gray-800/80">
          <p className="font-medium text-gray-900 dark:text-white">No recaps yet.</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            The first one will appear here once a gameweek has finished and its recap has been reviewed.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm font-medium">
            <Link href={PATHS.fixtures} className="text-emerald-700 hover:underline dark:text-emerald-300">
              Fixture difficulty
            </Link>
            <Link href={PATHS.players} className="text-emerald-700 hover:underline dark:text-emerald-300">
              Player stats
            </Link>
          </div>
        </div>
      ) : (
        seasons.map((season) => (
          <section key={season.season} className="mt-8" aria-labelledby={`season-${season.season}`}>
            <h2
              id={`season-${season.season}`}
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
            >
              {season.label} season
            </h2>
            <ul className="space-y-3">
              {season.recaps.map((r) => (
                <li key={r.path}>
                  <Link
                    href={r.path}
                    className="group flex items-center gap-3 rounded-xl border border-green-200 bg-white/90 p-4 shadow-sm transition-colors hover:border-emerald-400 dark:border-green-900 dark:bg-gray-800/80 dark:hover:border-emerald-600"
                  >
                    <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      GW{r.gameweek}
                    </span>
                    <span className="min-w-0 flex-1 font-medium text-gray-900 group-hover:underline dark:text-white">
                      {r.headline}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

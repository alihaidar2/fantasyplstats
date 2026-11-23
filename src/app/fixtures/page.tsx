import type { Metadata } from "next";
import Link from "next/link";
import FixtureMatrix from "@/components/features/fixtures/fixture-matrix";
import { getSnapshot } from "@/lib/data";
import { buildFixtureMatrix } from "@/lib/fpl";
import { fixturesMetadata } from "@/lib/metadata";
import { PATHS } from "@/lib/site";

export const metadata: Metadata = fixturesMetadata;

export default function FixturesPage() {
  const { bootstrap, fixtures } = getSnapshot();
  const matrix = buildFixtureMatrix(bootstrap, fixtures);

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
        Fixture Difficulty Matrix
      </h1>
      <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
        Planning a chip? See which clubs play twice or not at all in the{" "}
        <Link href={PATHS.schedule} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
          double and blank gameweek planner
        </Link>
        , or each club&apos;s form in the{" "}
        <Link href={PATHS.teams} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
          league table
        </Link>
        .
      </p>
      <FixtureMatrix matrix={matrix} />
    </div>
  );
}

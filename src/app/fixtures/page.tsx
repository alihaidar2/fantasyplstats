import type { Metadata } from "next";
import FixtureMatrix from "@/components/features/fixtures/fixture-matrix";
import { getSnapshot } from "@/lib/data";
import { buildFixtureMatrix } from "@/lib/fpl";
import { fixturesMetadata } from "@/lib/metadata";

export const metadata: Metadata = fixturesMetadata;

export default function FixturesPage() {
  const { bootstrap, fixtures } = getSnapshot();
  const matrix = buildFixtureMatrix(bootstrap, fixtures);

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
        Fixture Difficulty Matrix
      </h1>
      <FixtureMatrix matrix={matrix} />
    </div>
  );
}

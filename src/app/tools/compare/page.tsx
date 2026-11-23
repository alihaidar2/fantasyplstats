import type { Metadata } from "next";
import Link from "next/link";
import PlayerCompare from "@/components/features/tools/player-compare";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import { TOOLS_PATHS } from "@/lib/stats/tools";

export const metadata: Metadata = pageMetadata({
  title: "Compare FPL players",
  description:
    "Compare up to four FPL players side by side: price, ownership, points, form, xG, xA, per-90 stats, bonus, defensive contributions and fixtures.",
  path: TOOLS_PATHS.compare,
});

export default function ComparePage() {
  // The player data loads from /tools/data.json in the browser.
  const { generatedAt } = getSnapshot();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Compare players</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Put two to four players side by side, with the better number in each row highlighted. The page link keeps your
          selection, so you can share it. Ready to choose?{" "}
          <Link
            href={TOOLS_PATHS.planner}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
          >
            Plan your squad
          </Link>
          .
        </p>
      </div>
      <PlayerCompare version={generatedAt} />
    </div>
  );
}

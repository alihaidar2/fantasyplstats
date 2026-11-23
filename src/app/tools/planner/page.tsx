import type { Metadata } from "next";
import Link from "next/link";
import SquadPlanner from "@/components/features/tools/squad-planner";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import { TOOLS_PATHS } from "@/lib/stats/tools";

export const metadata: Metadata = pageMetadata({
  title: "FPL squad and transfer planner",
  description:
    "Plan your FPL squad and transfers: 15 players within £100.0m and 3 per club, your XI and captain, the fixtures ahead and the points cost of every hit.",
  path: TOOLS_PATHS.planner,
});

export default function PlannerPage() {
  // Only the snapshot time is passed down: the players and fixtures load
  // from /tools/data.json in the browser, so this page stays small.
  const { generatedAt } = getSnapshot();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Squad and transfer planner</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Build a 15-player squad within FPL&apos;s rules, pick your starting XI and captain, and plan transfers against
          the fixtures ahead. It checks the rules and adds up the money and points hits; it doesn&apos;t predict points.
          Your squad is saved in this browser and in the page link, so you can share it.{" "}
          <Link
            href={TOOLS_PATHS.compare}
            className="font-medium text-emerald-700 hover:underline dark:text-emerald-300"
          >
            Compare players
          </Link>{" "}
          before you decide.
        </p>
      </div>
      <SquadPlanner version={generatedAt} />
    </div>
  );
}

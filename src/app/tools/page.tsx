import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { pageMetadata } from "@/lib/metadata";
import { TOOLS_PATHS } from "@/lib/stats/tools";

export const metadata: Metadata = pageMetadata({
  title: "FPL tools",
  description:
    "Free Fantasy Premier League tools: a squad and transfer planner that checks FPL's rules and hits, and a side-by-side player comparison.",
  path: TOOLS_PATHS.hub,
});

const TOOLS = [
  {
    href: TOOLS_PATHS.planner,
    title: "Squad and transfer planner",
    body: "Build a 15-player squad within £100.0m and 3 per club, pick your XI and captain, and plan transfers with their points cost and the fixtures ahead.",
  },
  {
    href: TOOLS_PATHS.compare,
    title: "Compare players",
    body: "Two to four players side by side: price, ownership, points, form, expected stats, per-90 figures, bonus, defensive contributions and fixtures.",
  },
] as const;

export default function ToolsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">FPL tools</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Interactive tools that run in your browser on the same FPL data as the rest of the site. They check the rules
        and do the sums; the decisions are yours.
      </p>
      <ul className="mt-6 space-y-3">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="group flex items-center gap-3 rounded-xl border border-green-200 bg-white/90 p-4 shadow-sm transition-colors hover:border-emerald-400 dark:border-green-900 dark:bg-gray-800/80 dark:hover:border-emerald-600"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-gray-900 group-hover:underline dark:text-white">
                  {tool.title}
                </span>
                <span className="mt-1 block text-sm text-gray-600 dark:text-gray-400">{tool.body}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

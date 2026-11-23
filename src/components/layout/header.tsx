import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/common/theme-toggle";
import SiteNav from "@/components/layout/site-nav";
import { getRecaps, getSnapshot } from "@/lib/data";
import { teamsOfTheWeek } from "@/lib/fpl";
import type { NavGameweeks } from "@/lib/nav";
import { startedGameweeks } from "@/lib/stats/matches";

/** The two gameweek pages the menu links to, and whether there are recaps; only these go to the client. */
function navGameweeks(): NavGameweeks {
  const snapshot = getSnapshot();
  return {
    latest: startedGameweeks(snapshot.bootstrap.events, snapshot.fixtures).at(-1) ?? null,
    teamOfTheWeek: teamsOfTheWeek(snapshot).at(-1)?.gameweek ?? null,
    recaps: getRecaps().length > 0,
  };
}

export default function Header() {
  return (
    <header className="relative border-b-2 border-green-200 bg-white shadow-sm dark:border-green-900 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          {/* Logo/Brand: links home (there's no separate Home link). */}
          <Link href="/" className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
            <Badge
              variant="secondary"
              className="text-base sm:text-lg font-bold px-2 sm:px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            >
              FPL Stats
            </Badge>
            <span className="hidden text-sm text-gray-600 xl:inline dark:text-gray-400">
              Fantasy Premier League Analytics
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <SiteNav gameweeks={navGameweeks()} />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

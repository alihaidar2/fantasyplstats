import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Trophy, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ThisWeek from "@/components/features/home/this-week";
import GameweekStatsBox from "@/components/features/recap/gameweek-stats-box";
import { getRecaps, getSnapshot } from "@/lib/data";
import { buildHomePage, type HomeRecap } from "@/lib/home";
import { homeMetadata } from "@/lib/metadata";
import { PATHS } from "@/lib/site";

export const metadata: Metadata = homeMetadata;

const sectionTitle = "mb-3 text-lg font-bold text-gray-900 dark:text-white";

function LatestRecap({ latest }: { latest: HomeRecap }) {
  const { recap, seasonLabel, firstParagraph, stats } = latest;
  return (
    <section aria-labelledby="latest-recap" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 rounded-xl border border-green-200 bg-white/90 p-5 shadow-sm sm:p-6 dark:border-green-900 dark:bg-gray-800/80">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Latest recap · {seasonLabel} Gameweek {recap.gameweek}
        </p>
        <h2 id="latest-recap" className="mt-2 text-2xl font-bold leading-tight text-gray-900 sm:text-3xl dark:text-white">
          <Link href={recap.path} className="hover:underline">
            {recap.headline}
          </Link>
        </h2>
        <p className="mt-3 text-base leading-relaxed text-gray-700 dark:text-gray-300">{firstParagraph}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href={recap.path}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            Read the full recap
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href={PATHS.recaps} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">
            All recaps
          </Link>
        </div>
      </div>
      {stats && <GameweekStatsBox stats={stats} />}
    </section>
  );
}

function ToolCard({
  title,
  description,
  icon: Icon,
  href,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Omitted for a tool that isn't built yet: the card is then not a link. */
  href?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
        <Icon className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
        {title}
        {!href && (
          <span className="ml-auto rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Coming soon
          </span>
        )}
      </span>
      <span className="mt-1 block text-sm text-gray-600 dark:text-gray-400">{description}</span>
    </>
  );
  const base = "block rounded-xl border p-4 shadow-sm";
  return href ? (
    <Link
      href={href}
      className={`${base} border-green-200 bg-white/90 transition-colors hover:border-emerald-400 dark:border-green-900 dark:bg-gray-800/80 dark:hover:border-emerald-600`}
    >
      {body}
    </Link>
  ) : (
    <div className={`${base} border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900`}>{body}</div>
  );
}

export default function Home() {
  const { latest, thisWeek } = buildHomePage(getSnapshot(), getRecaps());

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 sm:p-6">
      {latest ? (
        <>
          <h1 className="sr-only">FPL Stats: Fantasy Premier League gameweek recaps, fixtures and player stats</h1>
          <LatestRecap latest={latest} />
        </>
      ) : (
        <header>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">
            Fantasy Premier League fixtures and player stats
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            The next deadline, the easiest runs of fixtures and this week&apos;s price and transfer moves.
          </p>
        </header>
      )}

      <section aria-labelledby="this-week">
        <h2 id="this-week" className={sectionTitle}>
          This week
        </h2>
        <ThisWeek data={thisWeek} />
      </section>

      <section aria-labelledby="tools">
        <h2 id="tools" className={sectionTitle}>
          Tools
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ToolCard
            title="Fixtures"
            icon={CalendarDays}
            href={PATHS.fixtures}
            description="Fixture difficulty for every team, gameweek by gameweek, to plan transfers and spot easy runs."
          />
          <ToolCard
            title="Players"
            icon={Users}
            href={PATHS.players}
            description="Prices, points, form, ownership, expected goals, defensive stats and transfers for every player."
          />
          <ToolCard
            title="Mini-league"
            icon={Trophy}
            description="Your mini-league's week in one place, with its own recap."
          />
        </div>
      </section>
    </div>
  );
}

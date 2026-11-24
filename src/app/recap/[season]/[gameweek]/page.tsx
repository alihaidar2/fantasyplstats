import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import GameweekStatsBox from "@/components/features/recap/gameweek-stats-box";
import RecapCards from "@/components/features/recap/recap-cards";
import { getRecaps, getSnapshot } from "@/lib/data";
import { recapMetadata, recapNotFoundMetadata } from "@/lib/metadata";
import { buildRecapPage, RECAP_PLACEHOLDER_PARAMS, recapParams, type RecapLink } from "@/lib/recap-pages";
import { parseGameweekParam } from "@/lib/recaps";
import { PATHS } from "@/lib/site";

// Every recap page is generated at build time; any other URL is a 404.
export const dynamicParams = false;

// A static export refuses a dynamic route whose generateStaticParams returns
// nothing, so until the first recap is published the route gets one
// placeholder, which renders the not-found page (noindex, linked from nowhere).
export function generateStaticParams() {
  const params = recapParams(getRecaps());
  return params.length ? params : [RECAP_PLACEHOLDER_PARAMS];
}

function findPage(season: string, gameweekParam: string) {
  const gameweek = parseGameweekParam(gameweekParam);
  if (gameweek === null) return null;
  return buildRecapPage(getSnapshot(), getRecaps(), season, gameweek);
}

export async function generateMetadata({ params }: PageProps<"/recap/[season]/[gameweek]">): Promise<Metadata> {
  const { season, gameweek } = await params;
  const page = findPage(season, gameweek);
  return page ? recapMetadata(page.recap) : recapNotFoundMetadata;
}

function NeighbourLink({ link, direction }: { link: RecapLink; direction: "previous" | "next" }) {
  const previous = direction === "previous";
  return (
    <Link
      href={link.path}
      rel={previous ? "prev" : "next"}
      className={`group flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-green-200 bg-white/90 p-4 shadow-sm transition-colors hover:border-emerald-400 dark:border-green-900 dark:bg-gray-800/80 dark:hover:border-emerald-600 ${
        previous ? "items-start text-left" : "items-end text-right"
      }`}
    >
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        {previous && <ArrowLeft className="h-3.5 w-3.5" aria-hidden />}
        {previous ? "Previous" : "Next"}: {link.label}
        {!previous && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="text-sm font-medium text-gray-900 group-hover:underline dark:text-white">{link.headline}</span>
    </Link>
  );
}

export default async function RecapPage({ params }: PageProps<"/recap/[season]/[gameweek]">) {
  const { season, gameweek } = await params;
  const page = findPage(season, gameweek);
  if (!page) notFound();
  const { recap, stats, entities, note, previous, next, seasonLabel } = page;
  const { body } = recap;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col p-4 sm:p-6">
      <Link
        href={PATHS.recaps}
        className="mb-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All recaps
      </Link>

      <article>
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            {seasonLabel} · Gameweek {recap.gameweek} recap
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-gray-900 sm:text-3xl dark:text-white">
            {recap.headline}
          </h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {body.kind === "cards" ? (
            <RecapCards cards={body.cards} entities={entities} footer={note} className="min-w-0 max-w-2xl" />
          ) : (
            <div className="min-w-0 space-y-4 text-base leading-relaxed text-gray-800 sm:text-lg dark:text-gray-200">
              {body.paragraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          )}
          {stats && (
            <aside aria-label={`Gameweek ${recap.gameweek} stats`}>
              <GameweekStatsBox stats={stats} />
            </aside>
          )}
        </div>

        {body.kind === "paragraphs" && (
          <p className="mt-8 flex gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{note}</span>
          </p>
        )}
      </article>

      {(previous || next) && (
        <nav aria-label="More recaps" className="mt-8 flex flex-col gap-3 sm:flex-row">
          {previous ? <NeighbourLink link={previous} direction="previous" /> : <div className="hidden flex-1 sm:block" />}
          {next ? <NeighbourLink link={next} direction="next" /> : <div className="hidden flex-1 sm:block" />}
        </nav>
      )}
    </div>
  );
}

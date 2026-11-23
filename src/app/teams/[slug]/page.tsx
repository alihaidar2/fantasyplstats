import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { AvailabilityBadge } from "@/components/features/players/availability-badge";
import { formatNumber, formatPrice, formatSigned } from "@/components/features/players/player-format";
import {
  ClubBadge,
  ClubLink,
  DifficultyBadge,
  EmptyNote,
  FixtureStrip,
  FormGuide,
  OutcomeBadge,
  Section,
  sectionCardClass,
} from "@/components/features/teams/team-bits";
import { getFormColor, getPositionColor } from "@/hooks/use-player-utils";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import { playerPath } from "@/lib/site";
import {
  buildClubPage,
  buildClubs,
  buildLeagueTable,
  clubDescription,
  describeResult,
  FIXTURE_STRIP_LENGTH,
  formatMatchDate,
  positionLabel,
  TEAMS_PATH,
  XGC_UNAVAILABLE_LABELS,
  type ClubPage,
  type ClubRecord,
} from "@/lib/stats/teams";
import { cn } from "@/lib/utils";

// Every club page is generated at build time; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return buildClubs(getSnapshot().bootstrap.teams).map((c) => ({ slug: c.slug }));
}

let table: ReturnType<typeof buildLeagueTable> | undefined;

function findPage(slug: string): ClubPage | null {
  const snapshot = getSnapshot();
  table ??= buildLeagueTable(snapshot);
  return buildClubPage(snapshot, slug, table);
}

export async function generateMetadata({ params }: PageProps<"/teams/[slug]">): Promise<Metadata> {
  const page = findPage((await params).slug);
  if (!page) return { title: "Club not found", robots: { index: false } };
  return pageMetadata({
    title: `${page.club.fullName} FPL stats: results, fixtures and top players`,
    description: clubDescription(page),
    path: page.club.path,
  });
}

const th = "px-2 py-2 text-right font-semibold whitespace-nowrap";
const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
const thead = "border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400";
const tr = "border-b border-gray-100 last:border-0 dark:border-gray-800";

function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className={cn(sectionCardClass, "flex flex-col gap-0.5 p-3")}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-2xl font-extrabold tabular-nums text-gray-900 dark:text-white">{value}</dd>
      {detail && <dd className="text-xs text-gray-500 dark:text-gray-400">{detail}</dd>}
    </div>
  );
}

function SplitTable({ home, away }: { home: ClubRecord; away: ClubRecord }) {
  const rows: [string, ClubRecord][] = [
    ["Home", home],
    ["Away", away],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm text-gray-800 dark:text-gray-200">
        <caption className="sr-only">Home and away record</caption>
        <thead className={thead}>
          <tr>
            <th scope="col" className={cn(th, "text-left")}>
              <span className="sr-only">Venue</span>
            </th>
            <th scope="col" className={th}><abbr title="Played" className="no-underline">P</abbr></th>
            <th scope="col" className={th}><abbr title="Won" className="no-underline">W</abbr></th>
            <th scope="col" className={th}><abbr title="Drawn" className="no-underline">D</abbr></th>
            <th scope="col" className={th}><abbr title="Lost" className="no-underline">L</abbr></th>
            <th scope="col" className={th}><abbr title="Goals for" className="no-underline">GF</abbr></th>
            <th scope="col" className={th}><abbr title="Goals against" className="no-underline">GA</abbr></th>
            <th scope="col" className={th}><abbr title="Clean sheets" className="no-underline">CS</abbr></th>
            <th scope="col" className={th}><abbr title="Points" className="no-underline">Pts</abbr></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, r]) => (
            <tr key={label} className={tr}>
              <th scope="row" className="px-2 py-2 text-left font-medium text-gray-900 dark:text-white">
                {label}
              </th>
              <td className={td}>{r.played}</td>
              <td className={td}>{r.won}</td>
              <td className={td}>{r.drawn}</td>
              <td className={td}>{r.lost}</td>
              <td className={td}>{r.goalsFor}</td>
              <td className={td}>{r.goalsAgainst}</td>
              <td className={td}>{r.cleanSheets}</td>
              <td className={cn(td, "font-bold text-gray-900 dark:text-white")}>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Results({ page }: { page: ClubPage }) {
  if (page.results.length === 0) return <EmptyNote>No results yet this season.</EmptyNote>;
  const provisional = page.results.some((r) => r.provisional);
  return (
    <>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-max text-sm text-gray-800 dark:text-gray-200">
          <caption className="sr-only">Results, newest first</caption>
          <thead className={cn(thead, "sticky top-0 bg-white dark:bg-gray-800")}>
            <tr>
              <th scope="col" className={cn(th, "text-left")}><abbr title="Gameweek" className="no-underline">GW</abbr></th>
              <th scope="col" className={cn(th, "text-left")}>Date</th>
              <th scope="col" className={cn(th, "text-left")}>Opponent</th>
              <th scope="col" className={cn(th, "text-center")}>Score</th>
              <th scope="col" className={cn(th, "text-center")}>Result</th>
            </tr>
          </thead>
          <tbody>
            {page.results.map((r) => (
              <tr key={r.fixtureId} className={tr}>
                <td className={cn(td, "text-left")}>{r.gameweek ?? "—"}</td>
                <td className={cn(td, "text-left text-gray-600 dark:text-gray-400")}>{formatMatchDate(r.kickoff)}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <ClubLink club={r.opponent} className="font-medium text-gray-900 dark:text-white">
                    {r.opponent.name}
                  </ClubLink>{" "}
                  <span className="text-xs text-gray-500 dark:text-gray-400">({r.home ? "H" : "A"})</span>
                </td>
                <td className={cn(td, "text-center font-semibold")}>
                  {r.goalsFor}–{r.goalsAgainst}
                  {r.provisional && (
                    <span title="Full time; FPL hasn't confirmed the result yet" className="text-gray-400">
                      *
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <OutcomeBadge outcome={r.outcome} />
                  <span className="sr-only">{describeResult(r)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {provisional && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">* Full time; FPL hasn&apos;t confirmed the result yet.</p>
      )}
    </>
  );
}

function TopPlayers({ page }: { page: ClubPage }) {
  if (page.topPlayers.length === 0) return <EmptyNote>No players listed for this club yet.</EmptyNote>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm text-gray-800 dark:text-gray-200">
        <caption className="sr-only">{page.club.fullName}&apos;s top FPL players by total points</caption>
        <thead className={thead}>
          <tr>
            <th scope="col" className={cn(th, "text-left")}>Player</th>
            <th scope="col" className={cn(th, "text-left")}><abbr title="Position" className="no-underline">Pos</abbr></th>
            <th scope="col" className={th}><abbr title="Total points" className="no-underline">Pts</abbr></th>
            <th scope="col" className={th}>Form</th>
            <th scope="col" className={th}>Price</th>
            <th scope="col" className={th}><abbr title="Selected by (share of FPL managers)" className="no-underline">Owned</abbr></th>
          </tr>
        </thead>
        <tbody>
          {page.topPlayers.map((p) => (
            <tr key={p.id} className={tr}>
              <th scope="row" className="px-2 py-2 text-left font-medium">
                <span className="flex items-center gap-2">
                  <Link
                    href={playerPath(p.id)}
                    prefetch={false}
                    title={p.fullName}
                    className="text-gray-900 hover:underline dark:text-white"
                  >
                    {p.name}
                  </Link>
                  <AvailabilityBadge availability={p.availability} />
                </span>
              </th>
              <td className="px-2 py-2">
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", getPositionColor(p.positionId))}>
                  {p.position}
                </span>
              </td>
              <td className={cn(td, "font-bold text-gray-900 dark:text-white")}>{p.totalPoints}</td>
              <td className={cn(td, "font-medium", getFormColor(p.form))}>{formatNumber(p.form, 1)}</td>
              <td className={td}>{formatPrice(p.price)}</td>
              <td className={td}>{formatNumber(p.selectedByPercent, 1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RemainingFixtures({ page }: { page: ClubPage }) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-full min-w-max text-sm text-gray-800 dark:text-gray-200">
        <caption className="sr-only">Every fixture still to play, with FPL difficulty</caption>
        <thead className={cn(thead, "sticky top-0 bg-white dark:bg-gray-800")}>
          <tr>
            <th scope="col" className={cn(th, "text-left")}><abbr title="Gameweek" className="no-underline">GW</abbr></th>
            <th scope="col" className={cn(th, "text-left")}>Date</th>
            <th scope="col" className={cn(th, "text-left")}>Opponent</th>
            <th scope="col" className={cn(th, "text-center")}>Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {page.upcoming.map((f) => (
            <tr key={f.fixtureId} className={tr}>
              <td className={cn(td, "text-left")}>{f.gameweek ?? <span title="Postponed; not yet rescheduled">TBC</span>}</td>
              <td className={cn(td, "text-left text-gray-600 dark:text-gray-400")}>{formatMatchDate(f.kickoff)}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                <ClubLink club={f.opponent} className="font-medium text-gray-900 dark:text-white">
                  {f.opponent.name}
                </ClubLink>{" "}
                <span className="text-xs text-gray-500 dark:text-gray-400">({f.home ? "H" : "A"})</span>
              </td>
              <td className="px-2 py-2 text-center">
                <DifficultyBadge fixture={f} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ClubPageView({ params }: PageProps<"/teams/[slug]">) {
  const page = findPage((await params).slug);
  if (!page) notFound();
  const { club, row } = page;
  const played = row.played > 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col p-4">
      <Link
        href={TEAMS_PATH}
        className="mb-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Premier League table
      </Link>

      <header className="mb-6 flex flex-wrap items-center gap-4">
        <ClubBadge code={club.code} size={56} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">{club.fullName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
            {played ? (
              <>
                <span>
                  {positionLabel(row)} of {page.clubs} · {row.points} pts
                </span>
                <FormGuide form={row.form} />
              </>
            ) : (
              <span>No results yet this season</span>
            )}
          </p>
        </div>
      </header>

      {page.inProgress.length > 0 && (
        <p className="mb-4 flex gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {page.inProgress.map((m) => (
              <span key={m.fixtureId} className="block">
                In progress at the last update: {m.home ? "home to" : "away at"} {m.opponent.name}
                {m.goalsFor !== null && m.goalsAgainst !== null ? `, ${m.goalsFor}–${m.goalsAgainst}` : ""}. Not
                counted until full time.
              </span>
            ))}
          </span>
        </p>
      )}

      {played && (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Position" value={`${row.position}${row.shared ? "=" : ""}`} detail={`of ${page.clubs}`} />
          <Stat label="Points" value={row.points} detail={`W${row.won} D${row.drawn} L${row.lost}`} />
          <Stat label="Goals for" value={row.goalsFor} detail={`${formatNumber(row.goalsFor / row.played, 1)} a game`} />
          <Stat
            label="Goals against"
            value={row.goalsAgainst}
            detail={`${formatNumber(row.goalsAgainst / row.played, 1)} a game · GD ${formatSigned(row.goalDifference)}`}
          />
          <Stat label="Clean sheets" value={row.cleanSheets} detail={`in ${row.played} ${row.played === 1 ? "game" : "games"}`} />
          <Stat
            label="xGC"
            value={row.xgc.available ? formatNumber(row.xgc.value, 1) : "—"}
            detail={
              row.xgc.available
                ? `Conceded ${formatSigned(Math.round((row.goalsAgainst - row.xgc.value) * 10) / 10, 1)} vs expected`
                : XGC_UNAVAILABLE_LABELS[row.xgc.reason]
            }
          />
        </dl>
      )}

      <div className="grid gap-6">
        <Section
          id="next-fixtures"
          title="Next fixtures"
          subtitle={
            page.nextWeeksDifficulty !== null
              ? `Next ${page.nextWeeks.length} gameweeks, coloured by FPL difficulty (1 easiest, 5 hardest). Average ${formatNumber(page.nextWeeksDifficulty, 1)}.`
              : undefined
          }
        >
          {page.nextWeeks.length > 0 ? (
            <FixtureStrip weeks={page.nextWeeks.slice(0, FIXTURE_STRIP_LENGTH)} />
          ) : page.upcoming.length > 0 ? (
            <EmptyNote>The remaining fixtures haven&apos;t been given a gameweek yet.</EmptyNote>
          ) : (
            <EmptyNote>No fixtures left this season.</EmptyNote>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section id="results" title="Results" subtitle={played ? "Newest first" : undefined}>
            <Results page={page} />
          </Section>
          <div className="grid content-start gap-6">
            <Section id="home-away" title="Home and away">
              {played ? <SplitTable home={page.home} away={page.away} /> : <EmptyNote>No results yet this season.</EmptyNote>}
            </Section>
            <Section id="top-players" title="Top FPL players" subtitle="By total FPL points this season">
              <TopPlayers page={page} />
            </Section>
          </div>
        </div>

        {page.upcoming.length > 0 && (
          <Section id="all-fixtures" title="All remaining fixtures" subtitle={`${page.upcoming.length} to play`}>
            <RemainingFixtures page={page} />
          </Section>
        )}
      </div>
    </div>
  );
}

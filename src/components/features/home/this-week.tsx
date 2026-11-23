import Link from "next/link";
import { ArrowLeftRight, ArrowRight, CalendarClock, CalendarDays, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPrice, formatPriceChange } from "@/components/features/players/player-format";
import type { EasyRun, PriceMove, ThisWeek as ThisWeekData, TransferTarget } from "@/lib/home";
import { PATHS } from "@/lib/site";
import { getDifficultyColor } from "@/lib/utils";

const cardClass =
  "gap-3 rounded-xl border border-green-200 bg-white/90 py-4 shadow-sm dark:border-green-900 dark:bg-gray-800/80";

function StripCard({
  title,
  icon: Icon,
  subtitle,
  children,
  footer,
}: {
  title: string;
  icon: LucideIcon;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className={cardClass}>
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {title}
        </CardTitle>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-4">
        <div className="flex-1">{children}</div>
        {footer && <div className="mt-3 text-sm">{footer}</div>}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 dark:text-gray-400">{children}</p>;
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-300"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function PlayerName({ player }: { player: { name: string; team: string; path: string } }) {
  return (
    <Link href={player.path} prefetch={false} className="min-w-0 truncate text-gray-900 hover:underline dark:text-white">
      <span className="font-medium">{player.name}</span>
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{player.team}</span>
    </Link>
  );
}

function FixtureRuns({ teams }: { teams: EasyRun[] }) {
  return (
    <ol className="space-y-2">
      {teams.map((t) => (
        <li key={t.team} className="flex items-start gap-2">
          <span className="w-10 shrink-0 pt-0.5 text-sm font-semibold text-gray-900 dark:text-white" title={t.name}>
            {t.team}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {t.weeks.map((week, i) =>
              week.length === 0 ? (
                <span key={i} className={`rounded px-1.5 py-0.5 text-[11px] ${getDifficultyColor()}`} title="Blank gameweek">
                  —
                </span>
              ) : (
                week.map((f, j) => (
                  <span
                    key={`${i}-${j}`}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getDifficultyColor(f.difficulty)}`}
                    title={`Difficulty ${f.difficulty}`}
                  >
                    {f.opponent} ({f.home ? "H" : "A"})
                  </span>
                ))
              ),
            )}
          </span>
          <span className="shrink-0 pt-0.5 text-sm tabular-nums text-gray-600 dark:text-gray-300" title="Average difficulty">
            {t.average.toFixed(1)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PriceList({ moves, label }: { moves: PriceMove[]; label: string }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</h3>
      {moves.length === 0 ? (
        <Empty>None yet.</Empty>
      ) : (
        <ul className="space-y-1">
          {moves.map((m) => (
            <li key={m.id} className="flex items-baseline justify-between gap-2 text-sm">
              <PlayerName player={m} />
              <span className="shrink-0 tabular-nums">
                <span className="text-gray-600 dark:text-gray-300">{formatPrice(m.price)}</span>{" "}
                <span
                  className={
                    m.change > 0 ? "font-semibold text-green-700 dark:text-green-400" : "font-semibold text-red-700 dark:text-red-400"
                  }
                >
                  ({formatPriceChange(m.change)})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TransferList({ players }: { players: TransferTarget[] }) {
  return (
    <ol className="space-y-1">
      {players.map((p) => (
        <li key={p.id} className="flex items-baseline justify-between gap-2 text-sm">
          <PlayerName player={p} />
          <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-white">
            {formatNumber(p.transfersIn)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DeadlineBanner({ deadline }: { deadline: ThisWeekData["deadline"] }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/30">
      <CalendarClock className="h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
      {deadline ? (
        <p className="text-gray-900 dark:text-white">
          <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Gameweek {deadline.gameweek} deadline
          </span>
          <time dateTime={deadline.time} className="text-lg font-bold">
            {deadline.label}
          </time>
        </p>
      ) : (
        <p className="font-medium text-gray-900 dark:text-white">No upcoming deadline: the season is over.</p>
      )}
    </div>
  );
}

/** The "this week" strip: next deadline, easiest fixtures, price changes and most transferred in. */
export default function ThisWeek({ data }: { data: ThisWeekData }) {
  const since = data.sinceGameweek ? `Since the Gameweek ${data.sinceGameweek} deadline` : "Since the last deadline";
  const range = data.fixtureRange;
  const rangeLabel = range
    ? range[0] === range[1]
      ? `Gameweek ${range[0]}, by FPL difficulty (lower is easier)`
      : `Gameweeks ${range[0]}–${range[1]}, by average FPL difficulty (lower is easier)`
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <DeadlineBanner deadline={data.deadline} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StripCard
          title="Easiest upcoming fixtures"
          icon={CalendarDays}
          subtitle={rangeLabel}
          footer={<MoreLink href={PATHS.fixtures}>Full fixture matrix</MoreLink>}
        >
          {data.easiestFixtures.length ? <FixtureRuns teams={data.easiestFixtures} /> : <Empty>No fixtures left this season.</Empty>}
        </StripCard>

        <StripCard
          title="Price risers and fallers"
          icon={TrendingUp}
          subtitle={since}
          footer={<MoreLink href={`${PATHS.players}#transfers`}>All price changes</MoreLink>}
        >
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-1">
            <PriceList moves={data.risers} label="Risers" />
            <PriceList moves={data.fallers} label="Fallers" />
          </div>
        </StripCard>

        <StripCard
          title="Most transferred in"
          icon={ArrowLeftRight}
          subtitle={since}
          footer={<MoreLink href={`${PATHS.players}#transfers`}>All transfers</MoreLink>}
        >
          {data.mostTransferredIn.length ? (
            <TransferList players={data.mostTransferredIn} />
          ) : (
            <Empty>No transfers yet.</Empty>
          )}
        </StripCard>
      </div>
    </div>
  );
}

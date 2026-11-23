import type { Metadata } from "next";
import { formatNumber, formatPrice } from "@/components/features/players/player-format";
import {
  CARD,
  EmptyState,
  HubPage,
  MUTED,
  PlayerName,
  Section,
  STRONG,
  TeamName,
} from "@/components/features/players-hub/hub-ui";
import { getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";
import {
  buildValueRankings,
  PLAYERS_HUB_PATHS,
  type ValueMetric,
  type ValueMetricId,
  type ValueRow,
} from "@/lib/stats/players-hub";
import { cn } from "@/lib/utils";

const PATH = PLAYERS_HUB_PATHS.value;

export const metadata: Metadata = pageMetadata({
  title: "FPL value rankings: points, xGI and form per £m",
  description:
    "The best-value Fantasy Premier League players by position: season points, expected goal involvements (xGI) and form per £m of price.",
  path: PATH,
});

const DESCRIPTIONS: Record<ValueMetricId, string> = {
  points: "Season total points divided by current price: who has returned the most for their money so far.",
  xgi: "Expected goal involvements (expected goals plus expected assists) divided by price: attacking output that may not have turned into points yet. Goalkeepers aren't ranked, since they have almost none.",
  form: "FPL's form (average points per match over the last 30 days) divided by price: who is good value right now.",
};

const baseFormat: Record<ValueMetricId, (n: number) => string> = {
  points: (n) => formatNumber(n),
  xgi: (n) => formatNumber(n, 2),
  form: (n) => formatNumber(n, 1),
};

function PositionList({
  metric,
  label,
  players,
}: Readonly<{ metric: ValueMetric; label: string; players: ValueRow[] }>) {
  const headingId = `${metric.id}-${label.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className={cn(CARD, "p-3")}>
      <h3 id={headingId} className={cn("mb-2 px-1 font-semibold", STRONG)}>
        {label}
      </h3>
      {players.length === 0 ? (
        <p className={cn("px-1 text-sm", MUTED)}>No players qualify yet.</p>
      ) : (
        <table className={cn("w-full table-fixed text-sm tabular-nums", MUTED)} aria-labelledby={headingId}>
          <colgroup>
            <col className="w-6" />
            <col />
            <col className="w-14" />
            <col className="w-12" />
            <col className="w-12" />
          </colgroup>
          <thead>
            <tr className="border-b text-xs">
              <th scope="col" className="py-1 text-left font-medium">
                <span className="sr-only">Rank</span>
                <span aria-hidden>#</span>
              </th>
              <th scope="col" className="py-1 text-left font-medium">Player</th>
              <th scope="col" className="py-1 text-right font-medium">Price</th>
              <th scope="col" className="py-1 text-right font-medium">{metric.baseLabel}</th>
              <th scope="col" className="py-1 text-right font-medium">
                <abbr title={metric.label} className="no-underline">
                  Per £m
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-1.5">{i + 1}</td>
                <td className="py-1.5">
                  <div className="flex min-w-0 flex-col">
                    <PlayerName player={p} />
                    <span className="text-xs">
                      <TeamName player={p} />
                    </span>
                  </div>
                </td>
                <td className="py-1.5 text-right">{formatPrice(p.price)}</td>
                <td className="py-1.5 text-right">{baseFormat[metric.id](p.base)}</td>
                <td className={cn("py-1.5 text-right font-semibold", STRONG)}>{formatNumber(p.value, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function ValuePage() {
  const { bootstrap } = getSnapshot();
  const rankings = buildValueRankings(bootstrap);
  const ranked = rankings.metrics.some((m) => m.positions.some((p) => p.players.length > 0));

  return (
    <HubPage
      path={PATH}
      title="Value rankings"
      intro={
        <>
          <p>
            Who gives the most for their price, by position: season points, expected goal involvements (xGI) and
            form, each divided by the player&apos;s current price in £m.
          </p>
          <p className="text-xs">
            {rankings.finishedGameweeks > 0 ? (
              <>
                To keep one-off cameos out, players need at least {formatNumber(rankings.minMinutes)} minutes this
                season (half the minutes available in {rankings.finishedGameweeks} finished gameweek
                {rankings.finishedGameweeks === 1 ? "" : "s"}, and at least one full match).
              </>
            ) : (
              <>Players need at least {formatNumber(rankings.minMinutes)} minutes this season to be ranked.</>
            )}{" "}
            Players who have left their club or gone on loan are left out; injured and doubtful players stay in,
            marked with a badge.
          </p>
        </>
      }
    >
      {!ranked ? (
        <EmptyState title="No value rankings yet.">
          They start once players have {formatNumber(rankings.minMinutes)} minutes, after the first gameweek.
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Rankings">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {rankings.metrics.map((m) => (
                <li key={m.id}>
                  <a href={`#${m.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                    {m.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {rankings.metrics.map((m) => (
            <Section key={m.id} id={m.id} title={m.label} description={DESCRIPTIONS[m.id]}>
              <div
                className={cn(
                  "grid grid-cols-1 gap-4 md:grid-cols-2",
                  m.positions.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3",
                )}
              >
                {m.positions.map((pos) => (
                  <PositionList key={pos.positionId} metric={m} label={pos.label} players={pos.players} />
                ))}
              </div>
            </Section>
          ))}
        </>
      )}
    </HubPage>
  );
}

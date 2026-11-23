import type { Metadata } from "next";
import { formatNumber, formatPrice } from "@/components/features/players/player-format";
import {
  EmptyState,
  HubPage,
  HubTable,
  MUTED,
  PlayerName,
  PositionBadge,
  Section,
  STRONG,
  type Column,
} from "@/components/features/players-hub/hub-ui";
import { formatNewsDate, formatOwnership } from "@/components/features/players-hub/hub-format";
import { getSnapshot } from "@/lib/data";
import { formatUpdatedAt } from "@/lib/fpl";
import { pageMetadata } from "@/lib/metadata";
import { buildAvailability, PLAYERS_HUB_PATHS, type AvailabilityRow } from "@/lib/stats/players-hub";
import { cn } from "@/lib/utils";

const PATH = PLAYERS_HUB_PATHS.availability;

export const metadata: Metadata = pageMetadata({
  title: "FPL injuries, suspensions and availability",
  description:
    "Every Fantasy Premier League player flagged as injured, doubtful, suspended or unavailable, with FPL's news and chance of playing, most-owned first.",
  path: PATH,
});

function chanceText(chance: number | null): string {
  return chance === null ? "—" : `${chance}%`;
}

const COLUMNS: Column<AvailabilityRow>[] = [
  { header: "Player", cell: (p) => <PlayerName player={p} showAvailability={false} /> },
  { header: "Team", cell: (p) => p.team },
  { header: "Pos", title: "Position", cell: (p) => <PositionBadge player={p} /> },
  { header: "Price", numeric: true, cell: (p) => <span className={STRONG}>{formatPrice(p.price)}</span> },
  {
    header: "Owned",
    title: "Percentage of FPL managers who own the player",
    numeric: true,
    cell: (p) => <span className={cn("font-medium", STRONG)}>{formatOwnership(p.ownership)}</span>,
  },
  {
    header: "Chance",
    title: "FPL's chance of the player playing in the next gameweek",
    numeric: true,
    cell: (p) => chanceText(p.chance),
  },
  {
    header: "News",
    className: "min-w-64 max-w-md whitespace-normal",
    cell: (p) => p.news || "—",
  },
  {
    header: "Added",
    title: "When FPL last updated the news (UK time)",
    cell: (p) =>
      p.newsAdded ? <time dateTime={p.newsAdded}>{formatNewsDate(p.newsAdded)}</time> : "—",
  },
];

export default function AvailabilityPage() {
  const { bootstrap, generatedAt } = getSnapshot();
  const groups = buildAvailability(bootstrap);
  const total = groups.reduce((n, g) => n + g.players.length, 0);
  // Older snapshots have no news dates; drop the column rather than show a column of dashes.
  const hasDates = groups.some((g) => g.players.some((p) => p.newsAdded));
  const columns = hasDates ? COLUMNS : COLUMNS.filter((c) => c.header !== "Added");

  return (
    <HubPage
      path={PATH}
      title="Injuries and availability"
      intro={
        <>
          <p>
            Every player FPL currently flags as injured, doubtful, suspended or unavailable, most-owned first. The
            chance of playing is FPL&apos;s own estimate for the next gameweek.
          </p>
          <p className="text-xs">
            As of <time dateTime={generatedAt}>{formatUpdatedAt(generatedAt)}</time>. FPL updates its news
            through the day; the club&apos;s own team news is the final word.
          </p>
        </>
      }
    >
      {groups.length === 0 ? (
        <EmptyState title="No flagged players right now.">
          FPL hasn&apos;t marked any player as injured, doubtful, suspended or unavailable.
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Statuses">
            <p className={cn("text-sm", MUTED)}>
              {formatNumber(total)} flagged players:{" "}
              {groups.map((g, i) => (
                <span key={g.status}>
                  {i > 0 && " · "}
                  <a href={`#${g.status}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                    {g.label} ({g.players.length})
                  </a>
                </span>
              ))}
            </p>
          </nav>
          {groups.map((g) => (
            <Section key={g.status} id={g.status} title={`${g.label} (${g.players.length})`}>
              <HubTable label={`${g.label} players`} columns={columns} rows={g.players} />
            </Section>
          ))}
        </>
      )}
    </HubPage>
  );
}

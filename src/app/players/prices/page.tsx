import type { Metadata } from "next";
import { formatNumber, formatPrice } from "@/components/features/players/player-format";
import {
  formatPriceChange,
  formatSignedInteger,
  signOf,
} from "@/components/features/players/players-table-format";
import {
  EmptyState,
  HubPage,
  HubTable,
  PlayerName,
  Section,
  STRONG,
  type Column,
  TeamName,
} from "@/components/features/players-hub/hub-ui";
import { formatOwnership } from "@/components/features/players-hub/hub-format";
import { getSnapshot } from "@/lib/data";
import { currentGameweek, formatUpdatedAt } from "@/lib/fpl";
import { pageMetadata } from "@/lib/metadata";
import { buildPriceChanges, PLAYERS_HUB_PATHS, SEASON_LIST_LENGTH, type PriceRow } from "@/lib/stats/players-hub";
import { cn } from "@/lib/utils";

const PATH = PLAYERS_HUB_PATHS.prices;

export const metadata: Metadata = pageMetadata({
  title: "FPL price changes: risers and fallers",
  description:
    "Fantasy Premier League price rises and falls since the last deadline and across the season, with each player's transfers in and out this gameweek.",
  path: PATH,
});

const SIGN_CLASS = {
  positive: "text-green-600 dark:text-green-400",
  negative: "text-red-600 dark:text-red-400",
  zero: "",
} as const;

function Signed({ value, text }: Readonly<{ value: number; text: string }>) {
  return <span className={cn("font-medium", SIGN_CLASS[signOf(value, 1)])}>{text}</span>;
}

const player: Column<PriceRow> = { header: "Player", cell: (p) => <PlayerName player={p} /> };
const team: Column<PriceRow> = { header: "Team", cell: (p) => <TeamName player={p} /> };
const price: Column<PriceRow> = {
  header: "Price",
  numeric: true,
  cell: (p) => <span className={STRONG}>{formatPrice(p.price)}</span>,
};
const changeEvent: Column<PriceRow> = {
  header: "Change",
  title: "Price change since the last deadline",
  numeric: true,
  cell: (p) => <Signed value={p.changeEvent} text={formatPriceChange(p.changeEvent)} />,
};
const changeStart: Column<PriceRow> = {
  header: "Season",
  title: "Price change since the start of the season",
  numeric: true,
  cell: (p) => <Signed value={p.changeStart} text={formatPriceChange(p.changeStart)} />,
};
const owned: Column<PriceRow> = {
  header: "Owned",
  title: "Percentage of FPL managers who own the player",
  numeric: true,
  cell: (p) => formatOwnership(p.ownership),
};
const transfers: Column<PriceRow>[] = [
  { header: "In", title: "Transfers in since the last deadline", numeric: true, cell: (p) => formatNumber(p.transfersIn) },
  { header: "Out", title: "Transfers out since the last deadline", numeric: true, cell: (p) => formatNumber(p.transfersOut) },
  {
    header: "Net",
    title: "Transfers in minus out since the last deadline",
    numeric: true,
    cell: (p) => <Signed value={p.netTransfers} text={formatSignedInteger(p.netTransfers)} />,
  },
];

const THIS_WEEK: Column<PriceRow>[] = [player, team, price, changeEvent, changeStart, owned, ...transfers];
const SEASON: Column<PriceRow>[] = [
  player,
  team,
  { header: "Start", title: "Price at the start of the season", numeric: true, cell: (p) => formatPrice(p.startPrice) },
  price,
  changeStart,
  owned,
];
const TRANSFERS: Column<PriceRow>[] = [player, team, price, changeEvent, owned, ...transfers];

function List({
  label,
  rows,
  columns,
  empty,
}: Readonly<{ label: string; rows: PriceRow[]; columns: Column<PriceRow>[]; empty: string }>) {
  return rows.length ? <HubTable label={label} columns={columns} rows={rows} /> : <EmptyState title={empty} />;
}

export default function PricesPage() {
  const { bootstrap, generatedAt } = getSnapshot();
  const prices = buildPriceChanges(bootstrap);
  const gameweek = currentGameweek(bootstrap.events);
  const since = gameweek ? `since the Gameweek ${gameweek} deadline` : "before the first deadline";

  return (
    <HubPage
      path={PATH}
      title="Price changes"
      intro={
        <>
          <p>
            Every price rise and fall {since}, the biggest moves of the season, and the transfers behind them. FPL
            changes prices once a day, overnight UK time, mostly in response to transfers.
          </p>
          <p className="text-xs">
            As of <time dateTime={generatedAt}>{formatUpdatedAt(generatedAt)}</time>. These are changes FPL has
            already made; this page doesn&apos;t predict the next ones.
          </p>
        </>
      }
    >
      <Section
        id="this-gameweek"
        title="This gameweek"
        description={`Price changes ${since}, biggest first, with ties going to the more-owned player.`}
      >
        <div className="flex flex-col gap-6">
          <div>
            <h3 className={cn("mb-2 font-semibold", STRONG)}>Risers ({prices.risers.length})</h3>
            <List label="Price risers this gameweek" rows={prices.risers} columns={THIS_WEEK} empty={`No price rises ${since}.`} />
          </div>
          <div>
            <h3 className={cn("mb-2 font-semibold", STRONG)}>Fallers ({prices.fallers.length})</h3>
            <List label="Price fallers this gameweek" rows={prices.fallers} columns={THIS_WEEK} empty={`No price falls ${since}.`} />
          </div>
        </div>
      </Section>

      <Section
        id="season"
        title="This season"
        description={`The ${SEASON_LIST_LENGTH} biggest rises and falls since the season's opening prices.`}
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h3 className={cn("mb-2 font-semibold", STRONG)}>Biggest risers</h3>
            <List label="Biggest price risers this season" rows={prices.seasonRisers} columns={SEASON} empty="No player has risen in price yet." />
          </div>
          <div>
            <h3 className={cn("mb-2 font-semibold", STRONG)}>Biggest fallers</h3>
            <List label="Biggest price fallers this season" rows={prices.seasonFallers} columns={SEASON} empty="No player has fallen in price yet." />
          </div>
        </div>
      </Section>

      <Section
        id="transfers"
        title="Transfers this gameweek"
        description={`The players with the most net transfers in and out ${since}. Heavy transfer traffic is what moves prices, but FPL doesn't publish its thresholds.`}
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h3 className={cn("mb-2 font-semibold", STRONG)}>Most transferred in</h3>
            <List label="Most net transfers in this gameweek" rows={prices.mostIn} columns={TRANSFERS} empty={`No transfers ${since} yet.`} />
          </div>
          <div>
            <h3 className={cn("mb-2 font-semibold", STRONG)}>Most transferred out</h3>
            <List label="Most net transfers out this gameweek" rows={prices.mostOut} columns={TRANSFERS} empty={`No transfers ${since} yet.`} />
          </div>
        </div>
      </Section>
    </HubPage>
  );
}

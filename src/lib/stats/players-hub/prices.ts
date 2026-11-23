// Price changes this gameweek (`cost_change_event`) and this season
// (`cost_change_start`), with this gameweek's transfers as context. FPL resets
// the "event" counters at each deadline. No predictions: only changes FPL has
// already made.

import { byOwnership, hubPlayers, toMillions, type HubBootstrap, type HubPlayer } from "./common";

export interface PriceRow extends HubPlayer {
  /** £m change since the last deadline. */
  changeEvent: number;
  /** £m change since the season started. */
  changeStart: number;
  /** £m price at the start of the season. */
  startPrice: number;
  transfersIn: number;
  transfersOut: number;
  /** Transfers in minus out since the last deadline. */
  netTransfers: number;
}

export interface PriceChanges {
  /** Every rise since the last deadline, biggest first. */
  risers: PriceRow[];
  /** Every fall since the last deadline, biggest first. */
  fallers: PriceRow[];
  /** The biggest rises since the season started. */
  seasonRisers: PriceRow[];
  /** The biggest falls since the season started. */
  seasonFallers: PriceRow[];
  /** Highest net transfers in since the last deadline. */
  mostIn: PriceRow[];
  /** Highest net transfers out since the last deadline. */
  mostOut: PriceRow[];
}

/** How many players the season and transfer lists show. */
export const SEASON_LIST_LENGTH = 20;
export const TRANSFER_LIST_LENGTH = 10;

export function buildPriceChanges(
  bootstrap: HubBootstrap,
  { seasonLimit = SEASON_LIST_LENGTH, transferLimit = TRANSFER_LIST_LENGTH } = {},
): PriceChanges {
  const toPlayer = hubPlayers(bootstrap);
  // Most-owned first, so every list breaks ties by ownership.
  const rows: PriceRow[] = [...bootstrap.elements].sort(byOwnership).map((e) => ({
    ...toPlayer(e),
    changeEvent: toMillions(e.cost_change_event),
    changeStart: toMillions(e.cost_change_start),
    startPrice: toMillions(e.now_cost - e.cost_change_start),
    transfersIn: e.transfers_in_event,
    transfersOut: e.transfers_out_event,
    netTransfers: e.transfers_in_event - e.transfers_out_event,
  }));

  // Array.prototype.sort is stable, so equal keys keep the ownership order.
  const top = (filter: (r: PriceRow) => boolean, key: (r: PriceRow) => number, limit = Infinity) =>
    rows
      .filter(filter)
      .sort((a, b) => key(b) - key(a))
      .slice(0, limit);

  return {
    risers: top((r) => r.changeEvent > 0, (r) => r.changeEvent),
    fallers: top((r) => r.changeEvent < 0, (r) => -r.changeEvent),
    seasonRisers: top((r) => r.changeStart > 0, (r) => r.changeStart, seasonLimit),
    seasonFallers: top((r) => r.changeStart < 0, (r) => -r.changeStart, seasonLimit),
    mostIn: top((r) => r.netTransfers > 0, (r) => r.netTransfers, transferLimit),
    mostOut: top((r) => r.netTransfers < 0, (r) => -r.netTransfers, transferLimit),
  };
}

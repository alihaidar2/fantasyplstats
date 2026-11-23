import type { ColumnSort, SortingState, VisibilityState } from "@tanstack/react-table";
import type { PlayerRow } from "@/lib/fpl/transforms";

// The players table's views. There is one column list (players-table-columns)
// and each view picks which columns are visible. Type-only imports keep this
// module loadable by Vitest without the `@/` alias.

/** Table column ids: every PlayerRow field except ones shown inside other cells. */
export type PlayerColumnId = Exclude<keyof PlayerRow, "id" | "positionId" | "availability">;

export type PlayersTableViewId = "overview" | "attack" | "defence" | "transfers" | "minutes";

export interface PlayersTableView {
  id: PlayersTableViewId;
  label: string;
  /** Columns shown after the player, position and team columns. */
  columns: readonly PlayerColumnId[];
  defaultSort: ColumnSort & { id: PlayerColumnId };
}

/** Shown on every view. */
export const ALWAYS_VISIBLE: readonly PlayerColumnId[] = ["name", "position", "team"];

export const DEFAULT_VIEW: PlayersTableViewId = "overview";

export const PLAYERS_TABLE_VIEWS: readonly PlayersTableView[] = [
  {
    id: "overview",
    label: "Overview",
    columns: [
      "price",
      "totalPoints",
      "pointsPerGame",
      "form",
      "selectedByPercent",
      "goals",
      "assists",
      "cleanSheets",
    ],
    defaultSort: { id: "totalPoints", desc: true },
  },
  {
    id: "attack",
    label: "Attack",
    columns: [
      "goals",
      "assists",
      "xg",
      "xa",
      "xgi",
      "xgPer90",
      "xaPer90",
      "xgiPer90",
      "goalsMinusXg",
      "setPieces",
    ],
    defaultSort: { id: "xgi", desc: true },
  },
  {
    id: "defence",
    label: "Defence",
    columns: [
      "cleanSheets",
      "defensiveContribution",
      "defensiveContributionPer90",
      "cbi",
      "tackles",
      "recoveries",
      "xgcPer90",
      "savesPer90",
    ],
    defaultSort: { id: "defensiveContribution", desc: true },
  },
  {
    id: "transfers",
    label: "Transfers and price",
    columns: [
      "price",
      "transfersInEvent",
      "transfersOutEvent",
      "netTransfersEvent",
      "priceChangeEvent",
      "priceChangeStart",
    ],
    defaultSort: { id: "netTransfersEvent", desc: true },
  },
  {
    id: "minutes",
    label: "Minutes and bonus",
    columns: ["minutes", "starts", "bonus", "bps"],
    defaultSort: { id: "minutes", desc: true },
  },
];

export function getView(id: PlayersTableViewId): PlayersTableView {
  return PLAYERS_TABLE_VIEWS.find((v) => v.id === id) ?? PLAYERS_TABLE_VIEWS[0];
}

export function isColumnInView(view: PlayersTableView, columnId: string): boolean {
  return (
    (ALWAYS_VISIBLE as readonly string[]).includes(columnId) ||
    (view.columns as readonly string[]).includes(columnId)
  );
}

/**
 * TanStack visibility for a view. Columns missing from the state default to
 * visible, so every column id must be listed.
 */
export function visibilityForView(
  view: PlayersTableView,
  columnIds: readonly string[],
): VisibilityState {
  return Object.fromEntries(columnIds.map((id) => [id, isColumnInView(view, id)]));
}

/** Keeps the current sort if the view shows its columns, else the view's default. */
export function sortingForView(current: SortingState, view: PlayersTableView): SortingState {
  if (current.length > 0 && current.every((s) => isColumnInView(view, s.id))) return current;
  return [{ ...view.defaultSort }];
}

/** "#attack" -> "attack"; anything unknown (or no hash) is the default view. */
export function viewFromHash(hash: string): PlayersTableViewId {
  const id = hash.replace(/^#/, "").toLowerCase();
  return PLAYERS_TABLE_VIEWS.find((v) => v.id === id)?.id ?? DEFAULT_VIEW;
}

/** The URL hash for a view; the default view has none. */
export function hashForView(id: PlayersTableViewId): string {
  return id === DEFAULT_VIEW ? "" : `#${id}`;
}

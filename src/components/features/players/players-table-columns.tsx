import type * as React from "react";
import Link from "next/link";
import type { Column, ColumnDef, SortingFn } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvailabilityBadge } from "@/components/features/players/availability-badge";
import { getFormColor, getPositionColor } from "@/hooks/use-player-utils";
import { cn } from "@/lib/utils";
import {
  SET_PIECE_LABELS,
  type PlayerRow,
  type SetPieceDuty,
  type SetPieceKind,
} from "@/lib/fpl/transforms";
import {
  compareSetPieces,
  formatInteger,
  formatPriceChange,
  formatSignedDecimal,
  formatSignedInteger,
  ordinal,
  signOf,
  type Sign,
} from "./players-table-format";
import type { PlayerColumnId } from "./players-table-views";

// One column list for every view; players-table-views picks which are visible.
// Cells only format: the values come ready-made from buildPlayerRows.

const STRONG = "text-gray-900 dark:text-white";
const MUTED = "text-gray-600 dark:text-gray-400";

const SIGN_COLORS: Record<Sign, string> = {
  positive: "text-green-600 dark:text-green-400",
  negative: "text-red-600 dark:text-red-400",
  zero: MUTED,
};

/** Column `size` doubles as a width class: 20 is the player column, 8 a stat. */
export const PLAYER_COLUMN_SIZE = 20;
const STAT_COLUMN_SIZE = 8;

export function columnWidthStyle(size: number): React.CSSProperties {
  if (size === PLAYER_COLUMN_SIZE) return { width: "10%", minWidth: "75px", maxWidth: "10%" };
  if (size === STAT_COLUMN_SIZE) return { width: "4%", minWidth: "40px", maxWidth: "4%" };
  return { width: "1.5%", minWidth: "15px", maxWidth: "1.5%" };
}

function SortableHeader({
  column,
  children,
  title,
  className,
}: Readonly<{
  column: Column<PlayerRow, unknown>;
  children: React.ReactNode;
  /** Explains the label, e.g. what an abbreviation stands for. */
  title?: string;
  className?: string;
}>) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      // Unsorted columns start descending for numbers and ascending for text,
      // then each click flips the direction.
      onClick={() =>
        column.toggleSorting(sorted ? sorted === "asc" : column.getFirstSortDir() === "desc")
      }
      className={cn("h-auto p-0 font-normal w-full justify-center", className)}
      title={title}
    >
      {children}
      {sorted === "asc" ? (
        <ChevronUp className="ml-2 h-4 w-4" />
      ) : sorted === "desc" ? (
        <ChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <ChevronsUpDown className="ml-2 h-4 w-4" />
      )}
    </Button>
  );
}

interface StatOptions {
  header: string;
  title?: string;
  /** The cell's text (or element). */
  format: (row: PlayerRow) => React.ReactNode;
  /** Classes for the cell; muted gray by default. */
  className?: (row: PlayerRow) => string;
  /** Sort value when it isn't the field itself. */
  accessor?: (row: PlayerRow) => number | string;
  sortingFn?: SortingFn<PlayerRow>;
  sortDescFirst?: boolean;
}

function stat(id: PlayerColumnId, options: StatOptions): ColumnDef<PlayerRow> {
  return {
    id,
    accessorFn: options.accessor ?? ((row) => row[id]),
    size: STAT_COLUMN_SIZE,
    ...(options.sortingFn && { sortingFn: options.sortingFn }),
    ...(options.sortDescFirst !== undefined && { sortDescFirst: options.sortDescFirst }),
    header: ({ column }) => (
      <SortableHeader column={column} title={options.title}>
        {options.header}
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className={cn("text-center", options.className?.(row.original) ?? MUTED)}>
        {options.format(row.original)}
      </div>
    ),
  };
}

const decimal = (digits: number) => (value: number) => value.toFixed(digits);
const two = decimal(2);

/** Signed values: green above zero, red below, gray at zero. */
const signColor = (value: (row: PlayerRow) => number, digits: number) => (row: PlayerRow) =>
  cn("font-medium", SIGN_COLORS[signOf(value(row), digits)]);

const SET_PIECE_SHORT: Record<SetPieceKind, string> = {
  penalties: "PEN",
  freekicks: "FK",
  corners: "CRN",
};

function SetPieceBadges({ duties }: Readonly<{ duties: readonly SetPieceDuty[] }>) {
  if (duties.length === 0) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">None</span>
      </>
    );
  }
  return (
    <div className="flex justify-center gap-1">
      {duties.map((duty) => {
        const description = `${SET_PIECE_LABELS[duty.kind]}: ${ordinal(duty.order)} choice`;
        return (
          <Badge
            key={duty.kind}
            className={cn(
              "px-1.5 text-[11px] border-transparent",
              duty.order === 1
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
            )}
            title={description}
            aria-label={description}
          >
            {SET_PIECE_SHORT[duty.kind]} {duty.order}
          </Badge>
        );
      })}
    </div>
  );
}

const PER_90 = "per 90 minutes played";

export const PLAYER_COLUMNS: ColumnDef<PlayerRow>[] = [
  // Every view
  {
    id: "name",
    accessorKey: "name",
    size: PLAYER_COLUMN_SIZE,
    header: ({ column }) => (
      <SortableHeader column={column} className="pl-2 pr-4 justify-start min-w-[200px]">
        Player
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const player = row.original;
      return (
        <div className="flex items-center gap-2 pl-2 pr-4 min-w-[200px]">
          <Link
            href={`/players/${player.id}`}
            className={cn(
              "font-medium truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors",
              STRONG,
            )}
          >
            {player.name}
          </Link>
          <AvailabilityBadge availability={player.availability} />
        </div>
      );
    },
  },
  stat("position", {
    header: "Position",
    accessor: (row) => row.positionId,
    sortDescFirst: false,
    format: (row) => (
      <Badge className={`text-xs ${getPositionColor(row.positionId)}`}>{row.position}</Badge>
    ),
  }),
  stat("team", { header: "Team", format: (row) => row.team }),

  // Overview
  stat("price", {
    header: "Price",
    title: "Current price",
    format: (row) => `£${row.price.toFixed(1)}m`,
    className: () => STRONG,
  }),
  stat("totalPoints", {
    header: "Points",
    title: "Total points this season",
    format: (row) => row.totalPoints,
    className: () => cn("font-medium", STRONG),
  }),
  stat("pointsPerGame", {
    header: "PPG",
    title: "Points per game",
    format: (row) => row.pointsPerGame.toFixed(1),
  }),
  stat("form", {
    header: "Form",
    title: "Average points per match over the last 30 days",
    format: (row) => row.form.toFixed(1),
    className: (row) => cn("font-medium", getFormColor(row.form)),
  }),
  stat("selectedByPercent", {
    header: "Ownership",
    title: "Percentage of FPL managers who own the player",
    format: (row) => `${row.selectedByPercent.toFixed(1)}%`,
  }),
  stat("goals", { header: "Goals", format: (row) => row.goals }),
  stat("assists", { header: "Assists", format: (row) => row.assists }),
  stat("cleanSheets", { header: "CS", title: "Clean sheets", format: (row) => row.cleanSheets }),

  // Attack
  stat("xg", { header: "xG", title: "Expected goals", format: (row) => two(row.xg) }),
  stat("xa", { header: "xA", title: "Expected assists", format: (row) => two(row.xa) }),
  stat("xgi", {
    header: "xGI",
    title: "Expected goal involvements (xG + xA)",
    format: (row) => two(row.xgi),
    className: () => cn("font-medium", STRONG),
  }),
  stat("xgPer90", {
    header: "xG/90",
    title: `Expected goals ${PER_90}`,
    format: (row) => two(row.xgPer90),
  }),
  stat("xaPer90", {
    header: "xA/90",
    title: `Expected assists ${PER_90}`,
    format: (row) => two(row.xaPer90),
  }),
  stat("xgiPer90", {
    header: "xGI/90",
    title: `Expected goal involvements ${PER_90}`,
    format: (row) => two(row.xgiPer90),
  }),
  stat("goalsMinusXg", {
    header: "G − xG",
    title: "Goals minus expected goals: positive means finishing above expectation",
    format: (row) => formatSignedDecimal(row.goalsMinusXg, 2),
    className: signColor((row) => row.goalsMinusXg, 2),
  }),
  stat("setPieces", {
    header: "Set pieces",
    title:
      "Set-piece duties and order: PEN penalties, FK direct free kicks, CRN corners and indirect free kicks",
    accessor: (row) => row.setPieces.length,
    sortingFn: (a, b) => compareSetPieces(a.original.setPieces, b.original.setPieces),
    format: (row) => <SetPieceBadges duties={row.setPieces} />,
  }),

  // Defence
  stat("defensiveContribution", {
    header: "DC",
    title:
      "Defensive contribution: clearances, blocks, interceptions and tackles, plus recoveries for midfielders and forwards",
    format: (row) => row.defensiveContribution,
    className: () => cn("font-medium", STRONG),
  }),
  stat("defensiveContributionPer90", {
    header: "DC/90",
    title: `Defensive contribution ${PER_90}`,
    format: (row) => two(row.defensiveContributionPer90),
  }),
  stat("cbi", {
    header: "CBI",
    title: "Clearances, blocks and interceptions",
    format: (row) => row.cbi,
  }),
  stat("tackles", { header: "Tackles", format: (row) => row.tackles }),
  stat("recoveries", { header: "Recoveries", format: (row) => row.recoveries }),
  stat("xgcPer90", {
    header: "xGC/90",
    title: `Expected goals conceded ${PER_90} (lower is better)`,
    format: (row) => two(row.xgcPer90),
  }),
  stat("savesPer90", {
    header: "Saves/90",
    title: `Saves ${PER_90}`,
    format: (row) => two(row.savesPer90),
  }),

  // Transfers and price
  stat("transfersInEvent", {
    header: "In",
    title: "Transfers in this gameweek",
    format: (row) => formatInteger(row.transfersInEvent),
  }),
  stat("transfersOutEvent", {
    header: "Out",
    title: "Transfers out this gameweek",
    format: (row) => formatInteger(row.transfersOutEvent),
  }),
  stat("netTransfersEvent", {
    header: "Net",
    title: "Net transfers this gameweek (in minus out)",
    format: (row) => formatSignedInteger(row.netTransfersEvent),
    className: signColor((row) => row.netTransfersEvent, 0),
  }),
  stat("priceChangeEvent", {
    header: "± GW",
    title: "Price change this gameweek",
    format: (row) => formatPriceChange(row.priceChangeEvent),
    className: signColor((row) => row.priceChangeEvent, 1),
  }),
  stat("priceChangeStart", {
    header: "± Season",
    title: "Price change since the start of the season",
    format: (row) => formatPriceChange(row.priceChangeStart),
    className: signColor((row) => row.priceChangeStart, 1),
  }),

  // Minutes and bonus
  stat("minutes", { header: "Minutes", format: (row) => formatInteger(row.minutes) }),
  stat("starts", { header: "Starts", format: (row) => row.starts }),
  stat("bonus", {
    header: "Bonus",
    title: "Bonus points",
    format: (row) => row.bonus,
    className: () => cn("font-medium", STRONG),
  }),
  stat("bps", {
    header: "BPS",
    title: "Bonus points system score, which decides each match's bonus points",
    format: (row) => formatInteger(row.bps),
  }),
];

export const PLAYER_COLUMN_IDS: readonly string[] = PLAYER_COLUMNS.map((c) => c.id!);

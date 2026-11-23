import Link from "next/link";
import type * as React from "react";
import { AvailabilityBadge } from "@/components/features/players/availability-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPositionColor } from "@/hooks/use-player-utils";
import { PATHS, playerPath } from "@/lib/site";
import { PLAYERS_HUB_PATHS, type HubPlayer } from "@/lib/stats/players-hub";
import { cn } from "@/lib/utils";
import { CARD_CLASS, LINK_CLASS } from "@/components/common/styles";

// Server-rendered building blocks shared by the players hub pages. No hooks
// or state, so none of this ships JavaScript beyond the table primitives.

export const STRONG = "text-gray-900 dark:text-white";
export const MUTED = "text-gray-600 dark:text-gray-400";
export const CARD = CARD_CLASS;
export const LINK = LINK_CLASS;

const HUB_LINKS = [
  { href: PATHS.players, label: "All players" },
  { href: PLAYERS_HUB_PATHS.availability, label: "Injuries" },
  { href: PLAYERS_HUB_PATHS.prices, label: "Price changes" },
  { href: PLAYERS_HUB_PATHS.value, label: "Value" },
  { href: PLAYERS_HUB_PATHS.setPieces, label: "Set pieces" },
  { href: PLAYERS_HUB_PATHS.template, label: "Template team" },
] as const;

/** Links between the hub's pages, with the current one marked. */
export function HubNav({ current }: Readonly<{ current: string }>) {
  return (
    <nav aria-label="Player tools" className="mb-4 -mx-1 overflow-x-auto">
      <ul className="flex gap-1 px-1 text-sm whitespace-nowrap">
        {HUB_LINKS.map((l) => {
          const active = l.href === current;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block rounded-md px-2.5 py-1 font-medium transition-colors",
                  active
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Page frame: hub links, the h1 and an intro. */
export function HubPage({
  path,
  title,
  intro,
  children,
}: Readonly<{ path: string; title: string; intro: React.ReactNode; children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col p-4">
      <HubNav current={path} />
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
      <div className={cn("mt-2 max-w-3xl space-y-2 text-sm sm:text-base", MUTED)}>{intro}</div>
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }: Readonly<{ title: string; children?: React.ReactNode }>) {
  return (
    <div className={cn(CARD, "p-6 text-center")}>
      <p className={cn("font-medium", STRONG)}>{title}</p>
      {children && <div className={cn("mt-1 text-sm", MUTED)}>{children}</div>}
    </div>
  );
}

export function Section({
  id,
  title,
  description,
  children,
}: Readonly<{ id: string; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={id} className="scroll-mt-4">
      <h2 id={id} className={cn("text-lg font-bold tracking-wide", STRONG)}>
        {title}
      </h2>
      {description && <p className={cn("mt-1 mb-3 max-w-3xl text-sm", MUTED)}>{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/** The club's short name linking to its page. */
export function TeamName({ player }: Readonly<{ player: Pick<HubPlayer, "team" | "teamPath"> }>) {
  return player.teamPath ? (
    <a href={player.teamPath} className="hover:underline">
      {player.team}
    </a>
  ) : (
    player.team
  );
}

export function PositionBadge({ player }: Readonly<{ player: Pick<HubPlayer, "position" | "positionId"> }>) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", getPositionColor(player.positionId))}>
      {player.position}
    </span>
  );
}

/** The player's name linking to their page, with an availability badge when they're flagged. */
export function PlayerName({
  player,
  showAvailability = true,
  className,
}: Readonly<{ player: HubPlayer; showAvailability?: boolean; className?: string }>) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Link
        href={playerPath(player.id)}
        prefetch={false}
        title={player.fullName}
        className={cn("truncate font-medium hover:underline", STRONG)}
      >
        {player.name}
      </Link>
      {showAvailability && <AvailabilityBadge availability={player.availability} className="shrink-0" />}
    </span>
  );
}

export interface Column<T> {
  header: string;
  /** Explains an abbreviated header. */
  title?: string;
  /** Numbers are right-aligned. */
  numeric?: boolean;
  /** Extra classes for the cells (for example, letting news text wrap). */
  className?: string;
  cell: (row: T) => React.ReactNode;
}

/**
 * A plain, server-rendered table. On narrow screens it scrolls sideways inside
 * the Table container; the first column (the player) stays readable.
 */
export function HubTable<T extends { id: number }>({
  label,
  columns,
  rows,
}: Readonly<{ label: string; columns: Column<T>[]; rows: T[] }>) {
  return (
    <div className={cn(CARD, "px-1 py-1")}>
      {/* Colours are set once here and inherited, which keeps the page payload small. */}
      <Table aria-label={label} className={cn("tabular-nums", MUTED)}>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.header}
                scope="col"
                className={cn("text-inherit", c.numeric ? "text-right" : "text-left")}
              >
                {c.title ? (
                  <abbr title={c.title} className="no-underline">
                    {c.header}
                  </abbr>
                ) : (
                  c.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              {columns.map((c) => (
                <TableCell key={c.header} className={cn(c.numeric && "text-right", c.className)}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

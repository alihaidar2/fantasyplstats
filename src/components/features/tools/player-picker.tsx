"use client";

import * as React from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvailabilityBadge } from "@/components/features/players/availability-badge";
import { getPositionColor } from "@/hooks/use-player-utils";
import { matchesPlayerSearch } from "@/lib/fpl/transforms";
import { playerPath } from "@/lib/site";
import {
  filterPlayers,
  formatTenths,
  POSITION_RULES,
  positionRule,
  type PlayerFilter,
  type PlayerSort,
  type ToolPlayer,
  type ToolsData,
} from "@/lib/stats/tools";
import { cn } from "@/lib/utils";
import { FixtureRun } from "./fixture-run";

const PAGE = 25;

const SORTS: { id: PlayerSort; label: string }[] = [
  { id: "points", label: "Total points" },
  { id: "form", label: "Form" },
  { id: "xgi", label: "xGI" },
  { id: "selected", label: "Ownership" },
  { id: "price", label: "Price" },
];

/** £4.0m to £15.0m in £0.5m steps, in tenths. */
const PRICE_STEPS = Array.from({ length: 23 }, (_, i) => 40 + i * 5);

/** Position badge in the players table's colours. */
export function PositionBadge({
  position,
  className,
}: Readonly<{ position: ToolPlayer["position"]; className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center justify-center rounded text-[10px] font-semibold",
        getPositionColor(position),
        className,
      )}
    >
      {positionRule(position).short}
    </span>
  );
}

/**
 * Search, filter and sort every player, with an action per row (add to the
 * squad, add to the comparison). The filter is controlled so the planner can
 * point it at a position.
 */
export function PlayerPicker({
  data,
  filter,
  onFilterChange,
  action,
  heading,
  headingId,
  note,
  searchRef,
}: Readonly<{
  data: ToolsData;
  filter: PlayerFilter;
  onFilterChange: (filter: PlayerFilter) => void;
  action: (player: ToolPlayer) => React.ReactNode;
  heading: string;
  headingId: string;
  note?: React.ReactNode;
  searchRef?: React.Ref<HTMLInputElement>;
}>) {
  const [shown, setShown] = React.useState(PAGE);
  const results = React.useMemo(() => filterPlayers(data.players, filter, matchesPlayerSearch), [data.players, filter]);
  const teams = React.useMemo(
    () => [...data.teams.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [data.teams],
  );

  const update = (patch: Partial<PlayerFilter>) => {
    setShown(PAGE);
    onFilterChange({ ...filter, ...patch });
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 text-gray-900 dark:text-gray-100">
      <h2 id={headingId} className="text-lg font-semibold text-gray-900 dark:text-white">
        {heading}
      </h2>
      {note}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input
          ref={searchRef}
          type="search"
          placeholder="Search by name…"
          aria-label="Search players by name"
          value={filter.query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update({ query: e.target.value })}
          className="col-span-2 bg-white sm:col-span-4 dark:bg-gray-900"
        />
        <Select
          value={filter.position === null ? "all" : String(filter.position)}
          onValueChange={(v) => update({ position: v === "all" ? null : (Number(v) as ToolPlayer["position"]) })}
        >
          <SelectTrigger className="w-full bg-white dark:bg-gray-900" aria-label="Filter by position">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All positions</SelectItem>
            {POSITION_RULES.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.plural}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filter.teamId === null ? "all" : String(filter.teamId)}
          onValueChange={(v) => update({ teamId: v === "all" ? null : Number(v) })}
        >
          <SelectTrigger className="w-full bg-white dark:bg-gray-900" aria-label="Filter by team">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filter.maxPrice === null ? "any" : String(filter.maxPrice)}
          onValueChange={(v) => update({ maxPrice: v === "any" ? null : Number(v) })}
        >
          <SelectTrigger className="w-full bg-white dark:bg-gray-900" aria-label="Maximum price">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any price</SelectItem>
            {PRICE_STEPS.map((p) => (
              <SelectItem key={p} value={String(p)}>
                Up to {formatTenths(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.sort} onValueChange={(v) => update({ sort: v as PlayerSort })}>
          <SelectTrigger className="w-full bg-white dark:bg-gray-900" aria-label="Sort players by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                Sort: {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
        {results.length === 0
          ? "No players match these filters."
          : `${results.length} player${results.length === 1 ? "" : "s"}, highest ${SORTS.find((s) => s.id === filter.sort)?.label.toLowerCase()} first`}
      </p>

      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
          {results.slice(0, shown).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <PositionBadge position={p.position} />
                  <Link
                    href={playerPath(p.id)}
                    className="truncate font-medium text-gray-900 hover:underline dark:text-white"
                    title={p.fullName}
                  >
                    {p.name}
                  </Link>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{p.team}</span>
                  <AvailabilityBadge availability={p.availability} className="shrink-0" />
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-gray-600 dark:text-gray-400">
                  <span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatTenths(p.price)}</span>
                  </span>
                  <span>{p.points} pts</span>
                  <span>Form {p.form.toFixed(1)}</span>
                  <span>xGI {p.xgi.toFixed(2)}</span>
                  <span>{p.selected.toFixed(1)}% owned</span>
                </div>
              </div>
              <FixtureRun gameweeks={data.gameweeks} fixtures={data.teams.get(p.teamId)?.fixtures ?? []} />
              <div className="ml-auto shrink-0">{action(p)}</div>
            </li>
          ))}
        </ul>
      )}
      {results.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="self-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Show {Math.min(PAGE, results.length - shown)} more
        </button>
      )}
    </section>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPositionColor } from "@/hooks/use-player-utils";
import { matchesPlayerSearch } from "@/lib/fpl/transforms";
import { playerPath } from "@/lib/site";
import { unpackLiveRows, type PackedLiveRow } from "./live-table-data";
import { cn } from "@/lib/utils";

type SortKey = "projected" | "points" | "bonus" | "minutes" | "goals" | "assists" | "cleanSheets" | "bps";

interface Column {
  key: SortKey;
  label: string;
  title: string;
}

const PAGE = 25;
const POSITIONS: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

export function LivePlayersTable({
  rows: packed,
  matches,
  hasProvisional,
}: {
  /** Packed by packLiveRows, highest projected points first. */
  rows: PackedLiveRow[];
  matches: { id: number; label: string }[];
  /** Whether any bonus is still provisional; shows the projected column. */
  hasProvisional: boolean;
}) {
  const columns: Column[] = [
    ...(hasProvisional
      ? [{ key: "projected" as const, label: "Proj.", title: "Points including provisional bonus" }]
      : []),
    { key: "points", label: "Pts", title: hasProvisional ? "FPL's live points (bonus only where FPL has added it)" : "Points" },
    { key: "bonus", label: "Bonus", title: "Bonus points (provisional ones marked *)" },
    { key: "minutes", label: "Min", title: "Minutes played" },
    { key: "goals", label: "G", title: "Goals" },
    { key: "assists", label: "A", title: "Assists" },
    { key: "cleanSheets", label: "CS", title: "Clean sheets" },
    { key: "bps", label: "BPS", title: "Bonus points system score" },
  ];

  const players = React.useMemo(() => unpackLiveRows(packed), [packed]);
  const [query, setQuery] = React.useState("");
  const [match, setMatch] = React.useState("all");
  const [position, setPosition] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: hasProvisional ? "projected" : "points",
    desc: true,
  });
  const [showAll, setShowAll] = React.useState(false);

  const rows = React.useMemo(() => {
    const filtered = players.filter(
      (p) =>
        (match === "all" || p.matches.includes(Number(match))) &&
        (position === "all" || String(p.positionId) === position) &&
        matchesPlayerSearch(p, query),
    );
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) => dir * (a[sort.key] - b[sort.key]) || b.projected - a.projected || a.id - b.id);
  }, [players, match, position, query, sort]);

  const shown = showAll ? rows : rows.slice(0, PAGE);
  // The columns are gameweek totals: a player in a double gameweek has both matches in them, whichever one is filtered to.
  const doubleInFilter = match !== "all" && rows.some((p) => p.matches.length > 1);
  const toggleSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: true }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name..."
          aria-label="Search players by name"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={match} onValueChange={setMatch}>
          <SelectTrigger className="w-48" aria-label="Filter by match">
            <SelectValue placeholder="Match" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All matches</SelectItem>
            {matches.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={position} onValueChange={setPosition}>
          <SelectTrigger className="w-32" aria-label="Filter by position">
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All positions</SelectItem>
            <SelectItem value="1">GKP</SelectItem>
            <SelectItem value="2">DEF</SelectItem>
            <SelectItem value="3">MID</SelectItem>
            <SelectItem value="4">FWD</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
          {rows.length} player{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {doubleInFilter && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          The figures are gameweek totals: players marked ×2 played twice this gameweek, so theirs include both
          matches, not just this one.
        </p>
      )}

      <div className="rounded-md border border-gray-200 dark:border-gray-700">
        <Table className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 w-44 bg-white dark:bg-gray-800">Player</TableHead>
              {columns.map((c) => {
                const active = sort.key === c.key;
                return (
                  <TableHead
                    key={c.key}
                    className="px-1 text-center"
                    aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => toggleSort(c.key)}
                      className="h-auto w-full justify-center p-1 font-normal"
                      title={c.title}
                    >
                      {c.label}
                      {active ? (
                        sort.desc ? (
                          <ChevronDown className="ml-0.5 h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronUp className="ml-0.5 h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown className="ml-0.5 h-3.5 w-3.5 opacity-50" aria-hidden />
                      )}
                    </Button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="h-20 text-center text-gray-600 dark:text-gray-400">
                  No players match.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="sticky left-0 z-10 max-w-44 bg-white dark:bg-gray-800">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn("shrink-0 rounded px-1 text-[10px] font-semibold", getPositionColor(p.positionId))}
                      >
                        {POSITIONS[p.positionId] ?? "—"}
                      </span>
                      <Link
                        href={playerPath(p.id)}
                        prefetch={false}
                        className="truncate font-medium text-gray-900 hover:underline dark:text-white"
                        title={p.fullName}
                      >
                        {p.name}
                      </Link>
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{p.team}</span>
                      {p.matches.length > 1 && (
                        <span
                          className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400"
                          title="Played twice this gameweek: the figures add both matches together"
                        >
                          ×2
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "px-1 text-center tabular-nums",
                        c.key === (hasProvisional ? "projected" : "points")
                          ? "font-semibold text-gray-900 dark:text-white"
                          : "text-gray-600 dark:text-gray-400",
                      )}
                    >
                      {c.key === "bonus" && p.provisionalBonus > 0 ? (
                        <span title={`${p.provisionalBonus} provisional`}>
                          {p.bonus}
                          <span className="text-amber-700 dark:text-amber-300">*</span>
                        </span>
                      ) : (
                        p[c.key]
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > PAGE && (
        <Button variant="outline" size="sm" className="self-center" onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show the top ${PAGE}` : `Show all ${rows.length} players`}
        </Button>
      )}
    </div>
  );
}

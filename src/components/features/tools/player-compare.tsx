"use client";

import * as React from "react";
import Link from "next/link";
import { AvailabilityBadge } from "@/components/features/players/availability-badge";
import { playerPath } from "@/lib/site";
import {
  compareRows,
  decodeCompareIds,
  DEFAULT_FILTER,
  encodeCompareIds,
  isOtherSeason,
  formatTenths,
  MAX_COMPARE,
  MIN_COMPARE,
  MIN_MINUTES_PER_90,
  positionRule,
  type CompareRow,
  type MetricFormat,
  type PlayerFilter,
  type ToolPlayer,
  type ToolsData,
} from "@/lib/stats/tools";
import { cn } from "@/lib/utils";
import { FixtureRun } from "./fixture-run";
import { PlayerPicker, PositionBadge } from "./player-picker";
import { ToolsDataStatus, useToolsData } from "./use-tools-data";

function format(value: number | null, kind: MetricFormat): string {
  if (value === null) return "—";
  switch (kind) {
    case "price":
      return formatTenths(value);
    case "int":
      return String(value);
    case "dec1":
      return value.toFixed(1);
    case "dec2":
      return value.toFixed(2);
    case "pct":
      return `${value.toFixed(1)}%`;
  }
}

export default function PlayerCompare({ version }: Readonly<{ version: string }>) {
  const state = useToolsData(version);
  if (state.status !== "ready") return <ToolsDataStatus state={state} />;
  return <Compare data={state.data} />;
}

function Compare({ data }: Readonly<{ data: ToolsData }>) {
  // Mounted only in the browser once the data has loaded, so the URL can be read here.
  const [otherSeason] = React.useState(() => isOtherSeason(window.location.search, data.season));
  // A link from another season names other players' ids, so it isn't loaded.
  const [ids, setIds] = React.useState(() => (otherSeason ? [] : decodeCompareIds(window.location.search, data.byId)));
  const [filter, setFilter] = React.useState<PlayerFilter>(DEFAULT_FILTER);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const search = encodeCompareIds(ids, data.season);
    const { pathname, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search ? `?${search}` : ""}${hash}`);
  }, [ids, data.season]);

  const players = React.useMemo(
    () =>
      ids.flatMap((id) => {
        const p = data.byId.get(id);
        return p ? [p] : [];
      }),
    [ids, data.byId],
  );
  const rows = React.useMemo(() => compareRows(players, data.teams), [players, data.teams]);
  const groups = rows.reduce<Map<string, CompareRow[]>>((map, row) => {
    map.set(row.metric.group, [...(map.get(row.metric.group) ?? []), row]);
    return map;
  }, new Map());

  const add = (p: ToolPlayer) =>
    setIds((current) => (current.length < MAX_COMPARE && !current.includes(p.id) ? [...current, p.id] : current));
  const remove = (id: number) => setIds((current) => current.filter((x) => x !== id));

  return (
    <div className="flex flex-col gap-8 text-gray-900 dark:text-gray-100">
      {otherSeason && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
        >
          That link is from another season, so its players aren&apos;t loaded: player ids change every season.
        </p>
      )}
      <section aria-labelledby="comparison-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="comparison-heading" className="text-lg font-semibold text-gray-900 dark:text-white">
            Comparison
          </h2>
          {players.length > 0 && (
            <button
              type="button"
              onClick={() => setIds([])}
              className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
            >
              Clear all
            </button>
          )}
        </div>

        {players.length < MIN_COMPARE ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-900 dark:text-white">
              {players.length === 0
                ? "Pick players to compare."
                : `${players[0].name} is picked: add at least one more.`}
            </p>
            <p className="mt-1">
              Choose {MIN_COMPARE} to {MAX_COMPARE} players from the list below. The link updates as you go, so you can
              share the comparison.
            </p>
            {players.length === 1 && (
              <button
                type="button"
                onClick={() => remove(players[0].id)}
                className="mt-3 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
              >
                Remove {players[0].name}
              </button>
            )}
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Season stats for {players.map((p) => p.name).join(", ")}. The best value in each row is highlighted.
              </caption>
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 w-28 min-w-[7rem] bg-gray-50 p-2 sm:w-48 text-left align-bottom text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  >
                    <span className="sr-only">Stat</span>
                  </th>
                  {players.map((p) => (
                    <th key={p.id} scope="col" className="min-w-[7.5rem] p-2 text-left align-top font-normal">
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <Link
                            href={playerPath(p.id)}
                            className="truncate font-semibold text-gray-900 hover:underline dark:text-white"
                            title={p.fullName}
                          >
                            {p.name}
                          </Link>
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <PositionBadge position={p.position} className="h-4 w-8" />
                            {p.team}
                          </span>
                          <AvailabilityBadge availability={p.availability} />
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          aria-label={`Remove ${p.name} from the comparison`}
                          className="shrink-0 rounded px-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        >
                          ✕
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {[...groups.entries()].map(([group, groupRows]) => (
                <tbody key={group} className="border-t border-gray-200 dark:border-gray-700">
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={players.length + 1}
                      className="sticky left-0 bg-white px-2 pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:bg-gray-900 dark:text-emerald-400"
                    >
                      {group}
                    </th>
                  </tr>
                  {group === "Fixtures" && (
                    <tr>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-white p-2 text-left align-top text-xs font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300"
                      >
                        {data.gameweeks.length > 0 ? `Next ${data.gameweeks.length} gameweeks` : "Upcoming"}
                      </th>
                      {players.map((p) => (
                        <td key={p.id} className="p-2 align-top">
                          {data.gameweeks.length === 0 ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              No more fixtures this season
                            </span>
                          ) : (
                            <FixtureRun
                              vertical
                              gameweeks={data.gameweeks}
                              fixtures={data.teams.get(p.teamId)?.fixtures ?? []}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  )}
                  {groupRows.map(({ metric, values, best }) => (
                    <tr key={metric.id} className="border-t border-gray-100 dark:border-gray-800">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-white p-2 text-left text-xs font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300"
                      >
                        {metric.label}
                        {metric.hint && (
                          <span className="mt-0.5 block text-[10px] font-normal leading-tight text-gray-500 dark:text-gray-400">
                            {metric.hint}
                          </span>
                        )}
                      </th>
                      {values.map((v, i) => {
                        const isBest = best.includes(i);
                        return (
                          <td
                            key={players[i].id}
                            className={cn(
                              "p-2 tabular-nums text-gray-900 dark:text-gray-100",
                              isBest &&
                                "bg-emerald-50 font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
                            )}
                          >
                            {format(v, metric.format)}
                            {isBest && <span className="sr-only"> (best)</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
        {players.length >= MIN_COMPARE && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Highlighted: the best value in each row (lowest for price and fixture difficulty; ownership isn&apos;t
            better or worse). Season totals; per-90 figures need at least {MIN_MINUTES_PER_90} minutes. Compare players
            in the same position for the fairest read
            {new Set(players.map((p) => p.position)).size > 1 &&
              `: these are ${[...new Set(players.map((p) => positionRule(p.position).plural.toLowerCase()))].join(" and ")}`}
            .
          </p>
        )}
      </section>

      <PlayerPicker
        data={data}
        filter={filter}
        onFilterChange={setFilter}
        heading="Add a player"
        headingId="compare-picker-heading"
        searchRef={searchRef}
        note={
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {players.length >= MAX_COMPARE
              ? `You're comparing ${MAX_COMPARE} players, the most at once: remove one to add another.`
              : `${players.length} of ${MAX_COMPARE} picked.`}
          </p>
        }
        action={(p) =>
          ids.includes(p.id) ? (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">Added</span>
          ) : (
            <button
              type="button"
              disabled={ids.length >= MAX_COMPARE}
              onClick={() => add(p)}
              aria-label={`Compare ${p.name}`}
              className="inline-flex h-8 items-center rounded-md border border-emerald-600 bg-emerald-600 px-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Compare
            </button>
          )
        }
      />
    </div>
  );
}

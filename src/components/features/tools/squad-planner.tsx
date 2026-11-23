"use client";

import * as React from "react";
import Link from "next/link";
import { AvailabilityBadge } from "@/components/features/players/availability-badge";
import { playerPath } from "@/lib/site";
import {
  addBlockReason,
  addPlayer,
  benchPlayer,
  canAddStarter,
  canSwap,
  cancelTransfer,
  checkSquad,
  clearReplacement,
  DEFAULT_FILTER,
  decodePlannerState,
  EMPTY_STATE,
  encodePlannerState,
  formatTenths,
  formationLabel,
  isOtherSeason,
  keepTransfers,
  MAX_FREE_TRANSFERS,
  parseBank,
  POSITION_RULES,
  positionCounts,
  removePlayer,
  setCaptain,
  setVice,
  SQUAD_SIZE,
  startPlayer,
  startSquadMode,
  startTransfers,
  swapPlayers,
  transferOut,
  transferSummary,
  XI_SIZE,
  type Chip,
  type PlannerState,
  type PlayerFilter,
  type PositionId,
  type SquadIssue,
  type ToolPlayer,
  type ToolsData,
} from "@/lib/stats/tools";
import { cn } from "@/lib/utils";
import { FixtureRun, FixtureRunHeader } from "./fixture-run";
import { PlayerPicker, PositionBadge } from "./player-picker";
import { ToolsDataStatus, useToolsData } from "./use-tools-data";

const STORAGE_KEY = "fplstats-planner";

interface Saved {
  season: string;
  search: string;
}

/** The saved squad for this season, if storage works and holds one. */
function readSaved(season: string): string {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
    return saved && saved.season === season && typeof saved.search === "string" ? saved.search : "";
  } catch {
    return "";
  }
}

function writeSaved(saved: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private mode or full storage: the URL still holds the squad.
  }
}

const smallButton =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40";
const neutralButton = `${smallButton} border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`;
const primaryButton = `${smallButton} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-600`;

export default function SquadPlanner({ version }: Readonly<{ version: string }>) {
  const state = useToolsData(version);
  if (state.status !== "ready") return <ToolsDataStatus state={state} />;
  return <Planner data={state.data} />;
}

function Planner({ data }: Readonly<{ data: ToolsData }>) {
  // Mounted only in the browser, once the data has loaded, so reading the URL
  // and storage while initialising can't cause a hydration mismatch.
  const [initial] = React.useState(() => {
    const fromLink = new URLSearchParams(window.location.search).has("squad");
    // A link from another season names other players' ids: don't load it.
    const otherSeason = fromLink && isOtherSeason(window.location.search, data.season);
    const fromUrl = fromLink && !otherSeason;
    const saved = readSaved(data.season);
    const search = fromUrl ? window.location.search : saved;
    // Opening a link must not replace the visitor's own saved squad until they edit it.
    return { ...decodePlannerState(search, data.byId), fromUrl, otherSeason, saved: fromUrl ? saved : "" };
  });
  const [plan, setPlan] = React.useState<PlannerState>(initial.state);
  const [filter, setFilter] = React.useState<PlayerFilter>(DEFAULT_FILTER);
  const [swapFrom, setSwapFrom] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState<"idle" | "copied" | "failed">("idle");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const pickerRef = React.useRef<HTMLDivElement>(null);

  const check = React.useMemo(() => checkSquad(plan, data.byId), [plan, data.byId]);
  const summary = React.useMemo(() => transferSummary(plan, data.byId), [plan, data.byId]);
  const transfers = plan.mode === "transfers";

  // Keep the URL (a shareable link) in step with the plan, and storage too
  // once the plan is the visitor's own: a plan loaded from a link is only
  // saved after they edit it.
  React.useEffect(() => {
    const search = encodePlannerState(plan, data.season);
    const { pathname, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search ? `?${search}` : ""}${hash}`);
    if (!initial.fromUrl || plan !== initial.state) writeSaved({ season: data.season, search });
  }, [plan, data.season, initial]);

  const update = (next: PlannerState) => {
    setPlan(next);
    setCopied("idle");
  };

  const focusPicker = (position: PositionId | null) => {
    setFilter((f) => ({ ...f, position, query: "" }));
    pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    searchRef.current?.focus({ preventScroll: true });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };

  const clearAll = () => {
    if (plan.squad.length === 0 || window.confirm("Clear your squad and start again?")) {
      update({ ...EMPTY_STATE });
      setSwapFrom(null);
    }
  };

  // Swapping: the bench player who wants in, then a starter to make way.
  const swapping = swapFrom !== null ? data.byId.get(swapFrom) : undefined;
  const onStart = (id: number) => {
    if (plan.starters.length < XI_SIZE) {
      update(startPlayer(plan, id, data.byId));
    } else {
      setSwapFrom(id);
    }
  };
  const onSwapWith = (starterId: number) => {
    if (swapFrom === null) return;
    update(swapPlayers(plan, starterId, swapFrom, data.byId));
    setSwapFrom(null);
  };

  const starterCounts = positionCounts(plan.starters, data.byId);
  const openTransfers = plan.transfers.filter((t) => t.in === null);
  const transferByOut = new Map(plan.transfers.map((t) => [t.out, t]));
  const transferByIn = new Map(plan.transfers.flatMap((t) => (t.in === null ? [] : [[t.in, t] as const])));

  // Rows: every squad slot, in the squad's order. A player out with no
  // replacement yet keeps his row, as an open transfer.
  type Row = { kind: "player"; player: ToolPlayer } | { kind: "open"; player: ToolPlayer };
  const rows: Row[] = plan.squad.flatMap((id): Row[] => {
    const t = transferByOut.get(id);
    const out = data.byId.get(id);
    if (!out) return [];
    if (!t) return [{ kind: "player", player: out }];
    if (t.in === null) return [{ kind: "open", player: out }];
    const incoming = data.byId.get(t.in);
    return incoming ? [{ kind: "player", player: incoming }] : [];
  });
  const slotId = (r: Row) => r.player.id;
  const isStarter = (r: Row) => plan.starters.includes(slotId(r));
  const byPosition = (a: Row, b: Row) => a.player.position - b.player.position;
  const startingRows = rows.filter(isStarter).sort(byPosition);
  const benchRows = rows.filter((r) => !isStarter(r)).sort(byPosition);
  const missing = transfers
    ? []
    : POSITION_RULES.flatMap((r) =>
        Array.from({ length: Math.max(0, r.squad - check.counts[r.id]) }, (_, i) => ({
          position: r.id,
          key: `${r.id}-${i}`,
        })),
      );

  const renderRow = (row: Row) => {
    const p = row.player;
    if (row.kind === "open") {
      return (
        <li
          key={`open-${p.id}`}
          className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50/60 dark:bg-amber-900/10"
        >
          <PositionBadge position={p.position} />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium text-gray-500 line-through dark:text-gray-400">{p.name}</span>{" "}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              out ({formatTenths(p.price)}): pick a {POSITION_RULES[p.position - 1].short} to bring in
            </span>
          </span>
          <button type="button" className={primaryButton} onClick={() => focusPicker(p.position)}>
            Choose
          </button>
          <button type="button" className={neutralButton} onClick={() => update(cancelTransfer(plan, p.id))}>
            Undo
          </button>
        </li>
      );
    }

    const starter = plan.starters.includes(p.id);
    const incoming = transferByIn.get(p.id);
    const captain = plan.captain === p.id;
    const vice = plan.vice === p.id;
    const swapTarget = swapping !== undefined && starter;
    const swapAllowed = swapping !== undefined && canSwap(starterCounts, p.position, swapping.position);
    const canStart = plan.starters.length < XI_SIZE ? canAddStarter(starterCounts, p.position) : true;

    return (
      <li
        key={p.id}
        className={cn(
          "flex flex-col gap-1.5 px-3 py-2",
          !starter && "bg-gray-50/80 dark:bg-gray-800/30",
          swapFrom === p.id && "ring-2 ring-inset ring-emerald-500",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex min-w-0 flex-1 basis-28 items-center gap-1.5">
            <PositionBadge position={p.position} />
            <Link
              href={playerPath(p.id)}
              className="truncate font-medium text-gray-900 hover:underline dark:text-white"
              title={p.fullName}
            >
              {p.name}
            </Link>
            {captain && (
              <span
                className="shrink-0 rounded-full bg-gray-900 px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-gray-900"
                title="Captain"
              >
                C
              </span>
            )}
            {vice && (
              <span
                className="shrink-0 rounded-full border border-gray-500 px-1 text-[10px] font-bold text-gray-700 dark:text-gray-200"
                title="Vice-captain"
              >
                V
              </span>
            )}
            {incoming && (
              <span className="shrink-0 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                IN
              </span>
            )}
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{p.team}</span>
            <AvailabilityBadge availability={p.availability} className="shrink-0" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {swapTarget ? (
              <button
                type="button"
                className={primaryButton}
                disabled={!swapAllowed}
                onClick={() => onSwapWith(p.id)}
                aria-label={`Swap ${p.name} for ${swapping.name}`}
                title={swapAllowed ? undefined : "This swap would break the formation rules"}
              >
                Swap
              </button>
            ) : (
              <>
                {starter && (
                  <>
                    <button
                      type="button"
                      className={cn(
                        neutralButton,
                        captain &&
                          "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900",
                      )}
                      aria-pressed={captain}
                      aria-label={`Captain: ${p.name}`}
                      title="Captain"
                      onClick={() => update(setCaptain(plan, p.id))}
                    >
                      C
                    </button>
                    <button
                      type="button"
                      className={cn(neutralButton, vice && "border-gray-500 bg-gray-200 dark:bg-gray-700")}
                      aria-pressed={vice}
                      aria-label={`Vice-captain: ${p.name}`}
                      title="Vice-captain"
                      onClick={() => update(setVice(plan, p.id))}
                    >
                      V
                    </button>
                  </>
                )}
                {starter ? (
                  <button
                    type="button"
                    className={neutralButton}
                    onClick={() => update(benchPlayer(plan, p.id))}
                    aria-label={`Bench ${p.name}`}
                  >
                    Bench
                  </button>
                ) : (
                  <button
                    type="button"
                    className={neutralButton}
                    disabled={!canStart}
                    onClick={() => onStart(p.id)}
                    aria-label={`Start ${p.name}`}
                    title={canStart ? undefined : "Starting him would break the formation rules"}
                  >
                    Start
                  </button>
                )}
                {transfers ? (
                  incoming ? (
                    <button
                      type="button"
                      className={neutralButton}
                      onClick={() => update(clearReplacement(plan, incoming.out))}
                      aria-label={`Undo bringing in ${p.name}`}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={neutralButton}
                      onClick={() => {
                        update(transferOut(plan, p.id));
                        focusPicker(p.position);
                      }}
                      aria-label={`Transfer out ${p.name}`}
                    >
                      Sell
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className={neutralButton}
                    onClick={() => update(removePlayer(plan, p.id))}
                    aria-label={`Remove ${p.name}`}
                    title="Remove"
                  >
                    ✕
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatTenths(p.price)}</span>
            <span>{p.points} pts</span>
            <span>Form {p.form.toFixed(1)}</span>
          </div>
          <FixtureRun
            className="sm:ml-auto"
            gameweeks={data.gameweeks}
            fixtures={data.teams.get(p.teamId)?.fixtures ?? []}
          />
        </div>
      </li>
    );
  };

  const fullSquad = check.squad.length === SQUAD_SIZE && openTransfers.length === 0;

  return (
    <div className="flex flex-col gap-6 text-gray-900 dark:text-gray-100">
      {initial.otherSeason && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
        >
          That link is from another season, so its players aren&apos;t loaded: player ids change every season.
        </p>
      )}

      {initial.fromUrl && initial.saved !== "" && plan === initial.state && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/90 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300"
        >
          This squad is from a link. Your own saved squad is untouched until you change this one.
          <button
            type="button"
            className={neutralButton}
            onClick={() => {
              setPlan(decodePlannerState(initial.saved, data.byId).state);
              setSwapFrom(null);
            }}
          >
            Load my saved squad
          </button>
        </p>
      )}

      {initial.dropped > 0 && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
        >
          {initial.dropped} player{initial.dropped === 1 ? "" : "s"} from{" "}
          {initial.fromUrl ? "this link" : "your saved squad"} couldn&apos;t be used (no longer in FPL&apos;s data, or
          breaking a squad rule) and {initial.dropped === 1 ? "was" : "were"} left out.
        </p>
      )}

      {data.gameweeks.length === 0 && (
        <p className="rounded-lg border border-gray-200 bg-white/90 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
          The season is over, so there are no fixtures left to plan for. The planner still checks squads against
          FPL&apos;s rules at this season&apos;s final prices.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Planner mode"
          className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-600"
        >
          {(
            [
              ["squad", "Build squad"],
              ["transfers", "Plan transfers"],
            ] as const
          ).map(([mode, label]) => {
            const active = plan.mode === mode;
            const disabled =
              !active && (mode === "transfers" ? check.squad.length < SQUAD_SIZE : plan.transfers.length > 0);
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  setSwapFrom(null);
                  update(mode === "transfers" ? startTransfers(plan, data.byId) : startSquadMode(plan));
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "bg-emerald-600 text-white"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className="text-xs text-gray-600 dark:text-gray-400">
            {copied === "copied" ? "Link copied" : copied === "failed" ? "Copy the address bar to share" : ""}
          </span>
          <button type="button" className={neutralButton} onClick={copyLink} disabled={plan.squad.length === 0}>
            Copy share link
          </button>
          <button type="button" className={neutralButton} onClick={clearAll} disabled={plan.squad.length === 0}>
            Start again
          </button>
        </div>
      </div>
      {plan.mode === "squad" && check.squad.length < SQUAD_SIZE && (
        <p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">
          Pick all {SQUAD_SIZE} players to plan transfers.
        </p>
      )}
      {transfers && plan.transfers.length > 0 && (
        <p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">
          Keep or reset your transfers to go back to building.
        </p>
      )}

      <Summary plan={plan} check={check} summary={summary} onChange={update} />

      <Issues issues={check.issues} complete={check.complete} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="squad-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="squad-heading" className="text-lg font-semibold text-gray-900 dark:text-white">
              {transfers ? "Your squad after transfers" : "Your squad"}
            </h2>
            <FixtureRunHeader gameweeks={data.gameweeks} className="hidden pr-3 sm:flex" />
          </div>

          {swapping && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-100"
            >
              <span className="flex-1">Pick a starter to swap with {swapping.name}.</span>
              <button type="button" className={neutralButton} onClick={() => setSwapFrom(null)}>
                Cancel
              </button>
            </div>
          )}

          {rows.length === 0 && missing.length === SQUAD_SIZE ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
              <p className="font-medium text-gray-900 dark:text-white">Your squad is empty.</p>
              <p className="mt-1">
                Add 2 goalkeepers, 5 defenders, 5 midfielders and 3 forwards from the player list, within £100.0m and
                with no more than 3 from one club.
              </p>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Starting XI{" "}
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  {check.starters.length === XI_SIZE
                    ? formationLabel(check.starterCounts)
                    : `${check.starters.length} of ${XI_SIZE}`}
                </span>
              </h3>
              {startingRows.length > 0 ? (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                  {startingRows.map(renderRow)}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No starters yet.</p>
              )}
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Bench</h3>
              {benchRows.length > 0 ? (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                  {benchRows.map(renderRow)}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No one on the bench.</p>
              )}
            </>
          )}

          {missing.length > 0 && missing.length < SQUAD_SIZE && (
            <>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Still to pick</h3>
              <ul className="flex flex-wrap gap-2">
                {missing.map((m) => (
                  <li key={m.key}>
                    <button
                      type="button"
                      onClick={() => focusPicker(m.position)}
                      className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-400 px-2 py-1 text-xs text-gray-700 hover:border-emerald-500 hover:bg-emerald-50 dark:border-gray-500 dark:text-gray-300 dark:hover:bg-emerald-900/20"
                    >
                      <PositionBadge position={m.position} />
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {transfers && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButton}
                disabled={summary.made === 0}
                onClick={() => update(keepTransfers(plan, data.byId))}
                title="Make the squad after transfers your squad, as confirming them in FPL would"
              >
                Keep these transfers
              </button>
              <button
                type="button"
                className={neutralButton}
                disabled={plan.transfers.length === 0}
                onClick={() => update(plan.transfers.reduce((s, t) => cancelTransfer(s, t.out), plan))}
              >
                Reset transfers
              </button>
            </div>
          )}
        </section>

        <div ref={pickerRef} className="scroll-mt-4">
          <PlayerPicker
            data={data}
            filter={filter}
            onFilterChange={setFilter}
            heading={transfers ? "Bring a player in" : "Add players"}
            headingId="picker-heading"
            searchRef={searchRef}
            note={
              <>
                <button
                  type="button"
                  className="self-start text-xs font-medium text-emerald-700 hover:underline lg:hidden dark:text-emerald-300"
                  onClick={() => document.getElementById("squad-heading")?.scrollIntoView({ behavior: "smooth" })}
                >
                  ↑ Back to your squad
                </button>
                {transfers ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {openTransfers.length > 0
                      ? `Picking a replacement for ${openTransfers.map((t) => data.byId.get(t.out)?.name).join(", ")}. You have ${formatTenths(summary.bankAfter + openTransfers.reduce((n, t) => n + (data.byId.get(t.out)?.price ?? 0), 0))} to spend.`
                      : "Sell a player from your squad first, then pick his replacement here."}
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {fullSquad
                      ? "Your squad is full: remove a player to make room."
                      : `${formatTenths(check.remaining)} left to spend.`}
                  </p>
                )}
              </>
            }
            action={(p) => {
              const reason = addBlockReason(plan, p.id, data.byId);
              return reason ? (
                <span className="block max-w-[7rem] text-right text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                  {reason}
                </span>
              ) : (
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => update(addPlayer(plan, p.id, data.byId))}
                  aria-label={`Add ${p.name}`}
                >
                  Add
                </button>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  children,
}: Readonly<{ label: string; value?: React.ReactNode; tone?: "bad" | "good"; children?: React.ReactNode }>) {
  return (
    <div className="flex flex-col rounded-lg border border-green-200 bg-white/90 px-3 py-2 dark:border-green-900 dark:bg-gray-800/80">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd
        className={cn(
          "text-lg font-bold tabular-nums text-gray-900 dark:text-white",
          tone === "bad" && "text-red-600 dark:text-red-400",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {value}
        {children}
      </dd>
    </div>
  );
}

function Summary({
  plan,
  check,
  summary,
  onChange,
}: Readonly<{
  plan: PlannerState;
  check: ReturnType<typeof checkSquad>;
  summary: ReturnType<typeof transferSummary>;
  onChange: (next: PlannerState) => void;
}>) {
  const [bankText, setBankText] = React.useState((plan.bank / 10).toFixed(1));
  const [bankFor, setBankFor] = React.useState(plan.bank);
  // Follow the bank when it changes elsewhere (keeping transfers, entering the mode).
  if (bankFor !== plan.bank) {
    setBankFor(plan.bank);
    setBankText((plan.bank / 10).toFixed(1));
  }
  const bankValid = parseBank(bankText) !== null;

  if (plan.mode === "squad") {
    return (
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Squad cost" value={formatTenths(check.cost)} />
        <Stat
          label="Left to spend"
          value={formatTenths(check.remaining)}
          tone={check.remaining < 0 ? "bad" : undefined}
        />
        <Stat label="Players" value={`${check.squad.length} / ${SQUAD_SIZE}`} />
        <Stat
          label="Formation"
          value={
            check.starters.length === XI_SIZE
              ? formationLabel(check.starterCounts)
              : `${check.starters.length} of ${XI_SIZE}`
          }
        />
      </dl>
    );
  }

  const fieldClass =
    "mt-0.5 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-base font-bold text-gray-900 tabular-nums dark:border-gray-600 dark:bg-gray-900 dark:text-white";
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="In the bank now (£m)">
        <input
          inputMode="decimal"
          aria-label="Money in the bank now, in millions"
          aria-invalid={!bankValid}
          className={cn(fieldClass, !bankValid && "border-red-500")}
          value={bankText}
          onChange={(e) => {
            setBankText(e.target.value);
            const tenths = parseBank(e.target.value);
            if (tenths !== null) {
              setBankFor(tenths);
              onChange({ ...plan, bank: tenths });
            }
          }}
        />
      </Stat>
      <Stat label="Free transfers">
        <select
          aria-label="Free transfers"
          className={fieldClass}
          value={plan.freeTransfers}
          onChange={(e) => onChange({ ...plan, freeTransfers: Number(e.target.value) })}
        >
          {Array.from({ length: MAX_FREE_TRANSFERS + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Stat>
      <Stat label="Chip">
        <select
          aria-label="Chip"
          className={fieldClass}
          value={plan.chip}
          onChange={(e) => onChange({ ...plan, chip: e.target.value as Chip })}
        >
          <option value="none">None</option>
          <option value="wildcard">Wildcard</option>
          <option value="freehit">Free Hit</option>
        </select>
      </Stat>
      <Stat label="Transfers" value={`${summary.made}${summary.open ? ` (+${summary.open} open)` : ""}`} />
      <Stat
        label="Points cost"
        value={summary.hitCost > 0 ? `-${summary.hitCost} pts` : "0 pts"}
        tone={summary.hitCost > 0 ? "bad" : undefined}
      />
      <Stat
        label="Bank after"
        value={formatTenths(summary.bankAfter)}
        tone={summary.bankAfter < 0 ? "bad" : undefined}
      />
      <div className="col-span-full text-xs text-gray-500 dark:text-gray-400">
        Sold {formatTenths(summary.sold)}, bought {formatTenths(summary.bought)}.{" "}
        {summary.extra > 0 &&
          `${summary.extra} transfer${summary.extra === 1 ? "" : "s"} over your free ones at -4 each. `}
        Players are sold at today&apos;s price: FPL only pays half of any rise since you bought a player (rounded down
        to £0.1m), so check your selling prices in FPL and adjust the bank if needed.
      </div>
    </dl>
  );
}

function Issues({ issues, complete }: Readonly<{ issues: SquadIssue[]; complete: boolean }>) {
  if (issues.length === 0 && !complete) return null;
  const tone: Record<SquadIssue["severity"], string> = {
    error: "text-red-700 dark:text-red-300",
    todo: "text-gray-700 dark:text-gray-300",
    warning: "text-amber-800 dark:text-amber-300",
  };
  const icon: Record<SquadIssue["severity"], string> = { error: "✕", todo: "•", warning: "!" };
  const label: Record<SquadIssue["severity"], string> = { error: "Rule broken", todo: "To do", warning: "Check" };
  return (
    <section
      aria-labelledby="issues-heading"
      className="rounded-lg border border-gray-200 bg-white/90 p-3 dark:border-gray-700 dark:bg-gray-800/60"
    >
      <h2 id="issues-heading" className="sr-only">
        Squad rules
      </h2>
      {complete && (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">✓ Your squad meets every FPL rule.</p>
      )}
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
          {issues.map((issue, i) => (
            <li key={`${issue.code}-${i}`} className={cn("flex gap-2", tone[issue.severity])}>
              <span aria-hidden className="w-3 shrink-0 text-center font-bold">
                {icon[issue.severity]}
              </span>
              <span>
                <span className="sr-only">{label[issue.severity]}: </span>
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

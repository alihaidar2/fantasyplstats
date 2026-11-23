// Build a validated snapshot of the FPL data the site needs. On match days,
// element-summary is refetched only for players whose team has played since
// the previous snapshot; everything else is reused from it. Teams of the week
// are fetched once a gameweek is settled and reused from then on; the current
// gameweek's live data is refetched on every build.

import type { FplClient, FplGameweekClient } from "./client";
import {
  SNAPSHOT_LIVE_STATS,
  type DreamTeam,
  type EventLive,
  type EventStatus,
  type SnapshotLive,
} from "./gameweek";
import { isMatchDay, startOfUkDay, teamsThatPlayed } from "./schedule";
import {
  MATCH_STAT_IDENTIFIERS,
  type Bootstrap,
  type ElementSummary,
  type Fixture,
  type FplEvent,
} from "./schemas";
import { SNAPSHOT_VERSION, snapshotSchema, type Snapshot } from "./snapshot-schema";
import { currentGameweek } from "./transforms";

/** What buildSnapshot needs from the FPL client. */
export type SnapshotClient = FplClient &
  Pick<FplGameweekClient, "getEventLive" | "getEventStatus" | "getDreamTeam">;

/** A previous snapshot older than this is not trusted for reuse. */
export const MAX_REUSE_AGE_MS = 24 * 60 * 60 * 1000;
/** Look back this far before the previous snapshot, so a match in progress then is refetched. */
export const PLAYED_LOOKBACK_MS = 6 * 60 * 60 * 1000;

export class SnapshotConsistencyError extends Error {
  constructor(problems: string[]) {
    super(`FPL data is inconsistent:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "SnapshotConsistencyError";
  }
}

/** The per-gameweek parts of a snapshot that checkConsistency can also check. */
export interface GameweekData {
  dreamTeams?: Snapshot["dreamTeams"];
  live?: Snapshot["live"];
}

/** A gameweek is settled, and its points final, once it is `finished` and `data_checked`. */
export function isSettled(event: Pick<FplEvent, "finished" | "data_checked">): boolean {
  return event.finished && event.data_checked;
}

const listIds = (ids: Iterable<number>, max = 5) => {
  const all = [...new Set(ids)];
  return all.slice(0, max).join(", ") + (all.length > max ? `, ... (${all.length} in all)` : "");
};

/** Cross-checks that schemas alone can't express. Throws on any problem. */
export function checkConsistency(
  bootstrap: Bootstrap,
  fixtures: readonly Fixture[],
  gameweekData: GameweekData = {},
): void {
  const problems: string[] = [];
  const teamIds = new Set(bootstrap.teams.map((t) => t.id));
  const typeIds = new Set(bootstrap.element_types.map((t) => t.id));
  const eventById = new Map(bootstrap.events.map((e) => [e.id, e]));
  const playerIds = new Set(bootstrap.elements.map((e) => e.id));
  const fixtureIds = new Set(fixtures.map((f) => f.id));

  const duplicates = (ids: number[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const [what, ids] of [
    ["team", bootstrap.teams.map((t) => t.id)],
    ["player", bootstrap.elements.map((e) => e.id)],
    ["fixture", fixtures.map((f) => f.id)],
  ] as const) {
    const dupes = duplicates([...ids]);
    if (dupes.length) problems.push(`duplicate ${what} ids: ${[...new Set(dupes)].join(", ")}`);
  }

  for (const e of bootstrap.elements) {
    if (!teamIds.has(e.team)) problems.push(`player ${e.id} has unknown team ${e.team}`);
    if (!typeIds.has(e.element_type)) problems.push(`player ${e.id} has unknown position ${e.element_type}`);
  }
  for (const f of fixtures) {
    if (!teamIds.has(f.team_h) || !teamIds.has(f.team_a)) {
      problems.push(`fixture ${f.id} has an unknown team`);
    }
    if (f.event !== null && !eventById.has(f.event)) {
      problems.push(`fixture ${f.id} has unknown gameweek ${f.event}`);
    }
    const strangers = f.stats.flatMap((s) => [...s.h, ...s.a]).map((r) => r.element).filter((id) => !playerIds.has(id));
    if (strangers.length) problems.push(`fixture ${f.id}'s stats name unknown players: ${listIds(strangers)}`);
  }
  if (fixtures.length === 0) problems.push("there are no fixtures");

  for (const [key, team] of Object.entries(gameweekData.dreamTeams ?? {})) {
    const event = eventById.get(Number(key));
    if (!event) {
      problems.push(`team of the week for unknown gameweek ${key}`);
      continue;
    }
    if (!isSettled(event)) problems.push(`team of the week for gameweek ${key}, which isn't settled`);
    const strangers = team.team.map((d) => d.element).filter((id) => !playerIds.has(id));
    if (team.top_player && !playerIds.has(team.top_player.id)) strangers.push(team.top_player.id);
    if (strangers.length) problems.push(`gameweek ${key}'s team of the week names unknown players: ${listIds(strangers)}`);
  }

  const live = gameweekData.live;
  if (live) {
    if (!eventById.has(live.gameweek)) problems.push(`live data for unknown gameweek ${live.gameweek}`);
    const ids = live.elements.map((e) => e.id);
    const strangers = ids.filter((id) => !playerIds.has(id));
    if (strangers.length) problems.push(`live data names unknown players: ${listIds(strangers)}`);
    const dupes = duplicates(ids);
    if (dupes.length) problems.push(`live data lists players more than once: ${listIds(dupes)}`);
    const unknownFixtures = live.elements.flatMap((e) => e.explain.map((x) => x.fixture)).filter((id) => !fixtureIds.has(id));
    if (unknownFixtures.length) problems.push(`live points breakdowns name unknown fixtures: ${listIds(unknownFixtures)}`);
  }

  if (problems.length) throw new SnapshotConsistencyError(problems.slice(0, 20));
}

/** Validates a parsed snapshot file. Throws if it is malformed or inconsistent. */
export function parseSnapshot(json: unknown): Snapshot {
  const snapshot = snapshotSchema.parse(json);
  checkConsistency(snapshot.bootstrap, snapshot.fixtures, snapshot);
  const missing = snapshot.bootstrap.elements.filter((e) => !snapshot.summaries[e.id]);
  if (missing.length) {
    throw new SnapshotConsistencyError([
      `${missing.length} players have no element-summary (e.g. ${missing.slice(0, 5).map((e) => e.id).join(", ")})`,
    ]);
  }
  return snapshot;
}

/**
 * The previous snapshot to reuse data from, or null if it can't be used: an
 * older version (such as a version 3 snapshot after the upgrade to 4), a
 * malformed file or inconsistent data. Null means the next fetch refetches
 * everything.
 */
export function parsePreviousSnapshot(json: unknown, warn: (message: string) => void = () => {}): Snapshot | null {
  try {
    return parseSnapshot(json);
  } catch (error) {
    warn(`Ignoring the previous snapshot: ${(error as Error).message}`);
    return null;
  }
}

/** Stat identifiers in the fixtures that aren't in MATCH_STAT_IDENTIFIERS (kept, but worth a warning). */
export function unknownStatIdentifiers(fixtures: readonly Fixture[]): string[] {
  const known = new Set<string>(MATCH_STAT_IDENTIFIERS);
  return [...new Set(fixtures.flatMap((f) => f.stats.map((s) => s.identifier)))].filter((id) => !known.has(id)).sort();
}

/**
 * Trims event/{gw}/live/ to what the snapshot keeps: the stats in
 * SNAPSHOT_LIVE_STATS and the points breakdown, for players with at least one
 * non-zero stat. A player left out had 0 of everything so far.
 */
export function trimLive(gameweek: number, live: EventLive, status: EventStatus): SnapshotLive {
  const elements: SnapshotLive["elements"] = [];
  for (const e of live.elements) {
    const stats = Object.fromEntries(SNAPSHOT_LIVE_STATS.map((key) => [key, e.stats[key]])) as SnapshotLive["elements"][number]["stats"];
    if (SNAPSHOT_LIVE_STATS.every((key) => stats[key] === 0)) continue;
    elements.push({
      id: e.id,
      stats,
      explain: e.explain.map((x) => ({
        fixture: x.fixture,
        stats: x.stats.map(({ identifier, points, value }) => ({ identifier, points, value })),
      })),
    });
  }
  return { gameweek, elements, status };
}

/** Size in bytes of each part of a snapshot as written (JSON), plus the total. */
export function snapshotSizes(snapshot: Snapshot): Record<string, number> {
  const encoder = new TextEncoder();
  const bytes = (value: unknown) => encoder.encode(JSON.stringify(value) ?? "").length;
  const sizes: Record<string, number> = {
    bootstrap: bytes(snapshot.bootstrap),
    fixtures: bytes(snapshot.fixtures),
    "fixture stats": bytes(snapshot.fixtures.map((f) => f.stats)),
    summaries: bytes(snapshot.summaries),
    dreamTeams: bytes(snapshot.dreamTeams),
    live: bytes(snapshot.live),
    "live explain": bytes(snapshot.live?.elements.map((e) => e.explain) ?? null),
  };
  sizes.total = bytes(snapshot);
  return sizes;
}

export interface RefreshPlan {
  mode: Snapshot["mode"];
  reason: string;
  /** Player ids whose element-summary must be fetched. */
  refetch: number[];
  /** Player ids whose element-summary is copied from the previous snapshot. */
  reuse: number[];
}

/** Season identity: the first gameweek's deadline changes every season. */
const seasonKey = (b: Bootstrap) => b.events.find((e) => e.id === 1)?.deadline_time ?? null;

export function planSummaryRefresh(args: {
  bootstrap: Bootstrap;
  fixtures: readonly Fixture[];
  previous: Snapshot | null;
  now: Date;
  forceFull?: boolean;
}): RefreshPlan {
  const { bootstrap, fixtures, previous, now, forceFull } = args;
  const allIds = bootstrap.elements.map((e) => e.id);
  const full = (reason: string): RefreshPlan => ({ mode: "full", reason, refetch: allIds, reuse: [] });

  if (forceFull) return full("full refresh requested");
  if (!previous) return full("no previous snapshot");
  const previousAt = new Date(previous.generatedAt);
  const age = now.getTime() - previousAt.getTime();
  if (age < 0 || age > MAX_REUSE_AGE_MS) return full("previous snapshot is too old to reuse");
  if (seasonKey(previous.bootstrap) !== seasonKey(bootstrap)) {
    return full("previous snapshot is from another season");
  }
  if (!isMatchDay(fixtures, now)) return full("no matches today");

  const since = new Date(
    Math.min(startOfUkDay(now).getTime(), previousAt.getTime() - PLAYED_LOOKBACK_MS),
  );
  const played = teamsThatPlayed(fixtures, since, now);
  const previousTeam = new Map(previous.bootstrap.elements.map((e) => [e.id, e.team]));

  const refetch: number[] = [];
  const reuse: number[] = [];
  for (const e of bootstrap.elements) {
    const stale =
      played.has(e.team) ||
      !previous.summaries[e.id] ||
      previousTeam.get(e.id) !== e.team;
    (stale ? refetch : reuse).push(e.id);
  }

  return {
    mode: "incremental",
    reason: `match day: ${played.size} teams have played since ${since.toISOString()}`,
    refetch,
    reuse,
  };
}

export interface DreamTeamPlan {
  /** Settled gameweeks whose team of the week must be fetched. */
  fetch: number[];
  /** Settled gameweeks whose team of the week is copied from the previous snapshot. */
  reuse: number[];
}

/**
 * Teams of the week to fetch and reuse. A settled gameweek's team never
 * changes, so it is reused from any previous snapshot of the same season,
 * however old, unless a full refresh is forced. Unsettled gameweeks get none.
 */
export function planDreamTeams(args: {
  bootstrap: Bootstrap;
  previous: Snapshot | null;
  forceFull?: boolean;
}): DreamTeamPlan {
  const { bootstrap, previous, forceFull } = args;
  const settled = bootstrap.events.filter(isSettled).map((e) => e.id).sort((a, b) => a - b);
  const usable =
    !forceFull && previous !== null && seasonKey(previous.bootstrap) === seasonKey(bootstrap);
  const fetch: number[] = [];
  const reuse: number[] = [];
  for (const gw of settled) (usable && previous!.dreamTeams[gw] ? reuse : fetch).push(gw);
  return { fetch, reuse };
}

export interface BuildSnapshotOptions {
  client: SnapshotClient;
  previous?: Snapshot | null;
  now?: Date;
  forceFull?: boolean;
  log?: (message: string) => void;
}

export interface BuildSnapshotResult {
  snapshot: Snapshot;
  plan: RefreshPlan;
  dreamTeamPlan: DreamTeamPlan;
}

const gameweekList = (gws: number[]) => (gws.length ? ` (GW${gws.join(", GW")})` : "");

export async function buildSnapshot(options: BuildSnapshotOptions): Promise<BuildSnapshotResult> {
  const { client, previous = null, now = new Date(), forceFull, log = () => {} } = options;

  const [bootstrap, fixtures] = await Promise.all([client.getBootstrap(), client.getFixtures()]);
  checkConsistency(bootstrap, fixtures);
  log(`bootstrap: ${bootstrap.elements.length} players, ${bootstrap.teams.length} teams; ${fixtures.length} fixtures`);
  const unknownStats = unknownStatIdentifiers(fixtures);
  if (unknownStats.length) {
    log(`warning: fixtures have stats this site doesn't know yet (kept as they are): ${unknownStats.join(", ")}`);
  }

  const plan = planSummaryRefresh({ bootstrap, fixtures, previous, now, forceFull });
  log(`${plan.mode} refresh (${plan.reason}): fetching ${plan.refetch.length} element summaries, reusing ${plan.reuse.length}`);
  const dreamTeamPlan = planDreamTeams({ bootstrap, previous, forceFull });
  log(
    `teams of the week: fetching ${dreamTeamPlan.fetch.length}${gameweekList(dreamTeamPlan.fetch)}, ` +
      `reusing ${dreamTeamPlan.reuse.length}`,
  );
  const current = currentGameweek(bootstrap.events);

  // Everything goes through the client's one limiter, so at most ~5 requests are in flight.
  const [fetched, fetchedDreamTeams, live] = await Promise.all([
    Promise.all(plan.refetch.map(async (id) => [id, await client.getElementSummary(id)] as const)),
    Promise.all(dreamTeamPlan.fetch.map(async (gw) => [gw, await client.getDreamTeam(gw)] as const)),
    current === null
      ? null
      : Promise.all([client.getEventLive(current), client.getEventStatus()]).then(([eventLive, status]) =>
          trimLive(current, eventLive, status),
        ),
  ]);

  const summaries: Record<string, ElementSummary> = {};
  for (const id of plan.reuse) summaries[id] = previous!.summaries[id];
  for (const [id, summary] of fetched) summaries[id] = summary;

  const dreamTeams: Record<string, DreamTeam> = {};
  for (const gw of dreamTeamPlan.reuse) dreamTeams[gw] = previous!.dreamTeams[gw];
  for (const [gw, team] of fetchedDreamTeams) dreamTeams[gw] = team;

  log(
    live
      ? `live: GW${live.gameweek}, ${live.elements.length} players with stats so far; event-status has ${live.status.status.length} days`
      : "live: no current gameweek",
  );

  const snapshot = parseSnapshot({
    version: SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    mode: plan.mode,
    bootstrap,
    fixtures,
    summaries,
    dreamTeams,
    live,
  });
  return { snapshot, plan, dreamTeamPlan };
}

/** Where the build reads the snapshot from, relative to the project root. */
export const DEFAULT_SNAPSHOT_FILE = ".data/snapshot.json";

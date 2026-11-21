// Build a validated snapshot of the FPL data the site needs. On match days,
// element-summary is refetched only for players whose team has played since
// the previous snapshot; everything else is reused from it.

import type { FplClient } from "./client";
import { isMatchDay, startOfUkDay, teamsThatPlayed } from "./schedule";
import {
  snapshotSchema,
  type Bootstrap,
  type ElementSummary,
  type Fixture,
  type Snapshot,
} from "./schemas";

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

/** Cross-checks that schemas alone can't express. Throws on any problem. */
export function checkConsistency(bootstrap: Bootstrap, fixtures: readonly Fixture[]): void {
  const problems: string[] = [];
  const teamIds = new Set(bootstrap.teams.map((t) => t.id));
  const typeIds = new Set(bootstrap.element_types.map((t) => t.id));
  const eventIds = new Set(bootstrap.events.map((e) => e.id));

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
    if (f.event !== null && !eventIds.has(f.event)) {
      problems.push(`fixture ${f.id} has unknown gameweek ${f.event}`);
    }
  }
  if (fixtures.length === 0) problems.push("there are no fixtures");

  if (problems.length) throw new SnapshotConsistencyError(problems.slice(0, 20));
}

/** Validates a parsed snapshot file. Throws if it is malformed or inconsistent. */
export function parseSnapshot(json: unknown): Snapshot {
  const snapshot = snapshotSchema.parse(json);
  checkConsistency(snapshot.bootstrap, snapshot.fixtures);
  const missing = snapshot.bootstrap.elements.filter((e) => !snapshot.summaries[e.id]);
  if (missing.length) {
    throw new SnapshotConsistencyError([
      `${missing.length} players have no element-summary (e.g. ${missing.slice(0, 5).map((e) => e.id).join(", ")})`,
    ]);
  }
  return snapshot;
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

export interface BuildSnapshotOptions {
  client: FplClient;
  previous?: Snapshot | null;
  now?: Date;
  forceFull?: boolean;
  log?: (message: string) => void;
}

export interface BuildSnapshotResult {
  snapshot: Snapshot;
  plan: RefreshPlan;
}

export async function buildSnapshot(options: BuildSnapshotOptions): Promise<BuildSnapshotResult> {
  const { client, previous = null, now = new Date(), forceFull, log = () => {} } = options;

  const [bootstrap, fixtures] = await Promise.all([client.getBootstrap(), client.getFixtures()]);
  checkConsistency(bootstrap, fixtures);
  log(`bootstrap: ${bootstrap.elements.length} players, ${bootstrap.teams.length} teams; ${fixtures.length} fixtures`);

  const plan = planSummaryRefresh({ bootstrap, fixtures, previous, now, forceFull });
  log(`${plan.mode} refresh (${plan.reason}): fetching ${plan.refetch.length} element summaries, reusing ${plan.reuse.length}`);

  const fetched = await Promise.all(
    plan.refetch.map(async (id) => [id, await client.getElementSummary(id)] as const),
  );

  const summaries: Record<string, ElementSummary> = {};
  for (const id of plan.reuse) summaries[id] = previous!.summaries[id];
  for (const [id, summary] of fetched) summaries[id] = summary;

  const snapshot = parseSnapshot({
    version: 1,
    generatedAt: now.toISOString(),
    mode: plan.mode,
    bootstrap,
    fixtures,
    summaries,
  });
  return { snapshot, plan };
}

/** Where the build reads the snapshot from, relative to the project root. */
export const DEFAULT_SNAPSHOT_FILE = ".data/snapshot.json";

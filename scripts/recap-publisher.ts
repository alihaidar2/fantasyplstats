// The weekly recap publisher (PLAN.md step 5b, item 4): picks the gameweek to
// recap, builds its no-hindsight context from live FPL data, runs the recap
// agent and writes content/recaps/<season>/gw<NN>.json, but only when the
// checker passed. scripts/publish-recap.ts is the command line for it, and
// .github/workflows/recap.yml turns a written recap into a pull request. The
// tests call these functions with recorded data and scripted models.

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildSnapshot,
  createFplClient,
  type EventStatus,
  type Fixture,
  type FplEvent,
  type Team,
  type FplGameweekClient,
  type SnapshotClient,
} from "../src/lib/fpl";
import { runRecapAgent, type AgentLimits } from "../src/lib/recap/agent";
import {
  buildGameweekContext,
  fetchGameweekSources,
  seasonOf,
  type GameweekSources,
  type SeasonData,
} from "../src/lib/recap/context";
import type { RecapModel } from "../src/lib/recap/model";
import type { Recap } from "../src/lib/recap/recap";
import { recapToText, type RecapContent } from "../src/lib/recap/text";
import { loadRecaps } from "../src/lib/recaps";
import type { Recording } from "./recorded-gameweeks";

type EventFields = Pick<FplEvent, "id" | "finished" | "data_checked">;

/** A request the publisher refuses: an unsettled or already published gameweek, a recap that failed its checks. */
export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

/** What the unsettled message needs from a fixture (FPL's fixtures/). */
export type EventFixture = Pick<Fixture, "event" | "kickoff_time" | "started" | "finished" | "team_h" | "team_a"> &
  Partial<Pick<Fixture, "finished_provisional" | "minutes">>;

/** Full time, whether or not FPL has confirmed the result (a recording keeps only `finished`). */
const fullTime = (f: EventFixture) => f.finished_provisional ?? f.finished;

/** The season's fixtures and clubs, so an unsettled message can name the matches holding a gameweek up. */
export interface SettlementDetails {
  fixtures: readonly EventFixture[];
  teams: readonly Pick<Team, "id" | "name">[];
}

const ukDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });
const ukTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

/** "Sat 22 Nov" for event-status's "2026-11-22". */
function matchDay(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(day.getTime()) ? date : ukDay.format(day).replace(",", "");
}

/** "Arsenal v Chelsea (in play, 67 min)" */
function describeFixture(f: EventFixture, teams: SettlementDetails["teams"]): string {
  const name = (id: number) => teams.find((t) => t.id === id)?.name ?? `team ${id}`;
  let state: string;
  if (!f.started) {
    const kickoff = f.kickoff_time ? new Date(f.kickoff_time) : null;
    state =
      kickoff && !Number.isNaN(kickoff.getTime())
        ? `kicks off ${ukDay.format(kickoff).replace(",", "")} ${ukTime.format(kickoff)} UK time`
        : "no kick-off time yet";
  } else if (!fullTime(f)) {
    state = f.minutes !== undefined ? `in play, ${f.minutes} min` : "in play";
  } else {
    state = "full time, result and bonus not yet confirmed";
  }
  return `${name(f.team_h)} v ${name(f.team_a)} (${state})`;
}

const POINTS_STATE: Record<string, string> = { r: "confirmed", p: "provisional", "": "not started" };

/**
 * Why a gameweek's points aren't final yet, or null once they are: it is
 * `finished` and `data_checked`, and when event-status still describes it
 * (it only ever describes the current gameweek), every match day's points are
 * confirmed ("r") with bonus added. Once event-status has moved on to a later
 * gameweek, `data_checked` is the word that counts.
 *
 * With the season's fixtures it says which matches are holding the gameweek
 * up (not started, in play, or awaiting confirmation), and with event-status
 * which match days lack confirmed points or bonus.
 */
export function unsettledReason(
  event: EventFields,
  eventStatus: EventStatus | null,
  details?: SettlementDetails,
): string | null {
  const fixtures = details?.fixtures.filter((f) => f.event === event.id) ?? [];
  const teams = details?.teams ?? [];
  const days = eventStatus?.status.filter((s) => s.event === event.id) ?? [];
  const pending = days.filter((d) => d.points !== "r" || !d.bonus_added);
  const pendingDays = pending
    .map((d) => `${matchDay(d.date)} (points ${POINTS_STATE[d.points] ?? `"${d.points}"`}, bonus ${d.bonus_added ? "added" : "not added"})`)
    .join(", ");

  if (!event.finished) {
    const unfinished = fixtures.filter((f) => !fullTime(f));
    return (
      `gameweek ${event.id} hasn't finished` +
      (unfinished.length
        ? `: ${unfinished.length} of ${fixtures.length} matches still to finish: ${unfinished.map((f) => describeFixture(f, teams)).join("; ")}`
        : "")
    );
  }
  if (!event.data_checked) {
    const unconfirmed = fixtures.filter((f) => !f.finished);
    return (
      `FPL hasn't checked gameweek ${event.id}'s data yet (data_checked is false)` +
      (unconfirmed.length ? `; not yet confirmed: ${unconfirmed.map((f) => describeFixture(f, teams)).join("; ")}` : "") +
      (pending.length ? `; match days without confirmed points or bonus: ${pendingDays}` : "")
    );
  }
  if (pending.length) {
    return `event-status hasn't confirmed gameweek ${event.id}'s points and bonus for ${pendingDays}`;
  }
  return null;
}

export type Selection = { gameweek: number } | { gameweek: null; reason: string };

export interface SelectOptions {
  events: readonly EventFields[];
  eventStatus: EventStatus | null;
  /** Gameweeks of this season that already have a recap in the content folder. */
  published: readonly number[];
  /** An explicit gameweek (--gameweek). */
  requested?: number;
  /** Fixtures and clubs, to name the matches a gameweek is waiting on. */
  details?: SettlementDetails;
}

/**
 * The gameweek to recap.
 *
 * Asked for one: it must be settled and not yet published, or this throws.
 * Otherwise: the latest finished gameweek, once it is settled and has no
 * recap. Nothing to do (null, with the reason) while it is still being
 * checked or once it has a recap: older gameweeks are never picked by
 * default, so a scheduled run can't backfill the season.
 */
export function selectGameweek(options: SelectOptions): Selection {
  const { events, eventStatus, published, requested, details } = options;
  if (requested !== undefined) {
    const event = events.find((e) => e.id === requested);
    if (!event) throw new PublishError(`Gameweek ${requested} is not in FPL's events.`);
    const reason = unsettledReason(event, eventStatus, details);
    if (reason) throw new PublishError(`Gameweek ${requested} isn't settled: ${reason}.`);
    if (published.includes(requested)) {
      throw new PublishError(
        `Gameweek ${requested} already has a recap. Delete its file first if it really should be written again.`,
      );
    }
    return { gameweek: requested };
  }

  const latest = events.filter((e) => e.finished).sort((a, b) => b.id - a.id)[0];
  if (!latest) return { gameweek: null, reason: "no gameweek has finished yet" };
  const reason = unsettledReason(latest, eventStatus, details);
  if (reason) return { gameweek: null, reason: `waiting: ${reason}` };
  if (published.some((gw) => gw >= latest.id)) {
    // Say what the next one is waiting on, if it has started.
    const next = events.filter((e) => e.id > latest.id).sort((a, b) => a.id - b.id)[0];
    const started = next && details?.fixtures.some((f) => f.event === next.id && f.started);
    const nextReason = next && started ? unsettledReason(next, eventStatus, details) : null;
    return { gameweek: null, reason: `gameweek ${latest.id} already has a recap${nextReason ? `, and ${nextReason}` : ""}` };
  }
  return { gameweek: latest.id };
}

/** Where a gameweek's recap goes: <dir>/<season>/gw<NN>.json */
export function recapFile(contentDir: string, season: string, gameweek: number): string {
  return path.join(contentDir, season, `gw${String(gameweek).padStart(2, "0")}.json`);
}

/** Where the publisher gets FPL data from: live FPL, or a recording for offline runs. */
export interface PublishSource {
  /** The events and event-status the gameweek is chosen from, and the fixtures and clubs that say what an unsettled one waits on. */
  overview(): Promise<{
    season: string;
    events: EventFields[];
    eventStatus: EventStatus | null;
    details?: SettlementDetails;
  }>;
  /** Everything a gameweek's context is built from. */
  sources(gameweek: number): Promise<GameweekSources>;
}

/**
 * Live FPL data. The season comes from a fresh snapshot built the way
 * `npm run fetch` builds one (every player's element-summary), or from a
 * snapshot file passed in; the gameweek's live data, fixtures with stats,
 * dream team and event-status are fetched fresh.
 */
export function liveSource(options: {
  client?: SnapshotClient & FplGameweekClient;
  /** A snapshot to use instead of fetching one (already parsed and validated). */
  snapshot?: SeasonData;
  log?: (line: string) => void;
}): PublishSource {
  const client = options.client ?? createFplClient({ baseUrl: process.env.FPL_BASE_URL || undefined });
  const log = options.log ?? (() => {});
  return {
    async overview() {
      const [bootstrap, eventStatus, fixtures] = await Promise.all([
        client.getBootstrap(),
        client.getEventStatus(),
        client.getFixtures(),
      ]);
      return {
        season: seasonOf({ bootstrap }),
        events: bootstrap.events,
        eventStatus,
        details: { fixtures, teams: bootstrap.teams },
      };
    },
    async sources(gameweek) {
      let snapshot = options.snapshot;
      if (!snapshot) {
        log("Fetching a full FPL snapshot (every player's history)...");
        ({ snapshot } = await buildSnapshot({ client, previous: null, forceFull: true, log }));
      }
      log(`Fetching gameweek ${gameweek}'s live data, fixtures, dream team and event-status...`);
      return { snapshot, ...(await fetchGameweekSources(client, gameweek)) };
    },
  };
}

/** The gameweeks recorded in test/fixtures/gameweeks/, as of just after the latest one: no network. */
export function recordedSource(recording: Recording): PublishSource {
  const last = Math.max(...recording.gameweeks);
  return {
    async overview() {
      const { snapshot } = recording.sources(last);
      return {
        season: seasonOf(snapshot),
        events: snapshot.bootstrap.events,
        eventStatus: null,
        details: { fixtures: snapshot.fixtures, teams: snapshot.bootstrap.teams },
      };
    },
    async sources(gameweek) {
      return recording.sources(gameweek);
    },
  };
}

export interface PublishOptions {
  source: PublishSource;
  /** The writer. Only null with selectOnly. */
  model: RecapModel | null;
  /** The published recaps folder (content/recaps). */
  contentDir: string;
  gameweek?: number;
  /** Choose the gameweek and stop: no snapshot, no model. */
  selectOnly?: boolean;
  /** Write nothing. */
  dryRun?: boolean;
  limits?: Partial<AgentLimits>;
  now?: () => Date;
  log?: (line: string) => void;
}

export type PublishResult =
  | { status: "nothing-to-do"; season: string; reason: string }
  | { status: "selected"; season: string; gameweek: number; file: string }
  /** `written` is false on a dry run. */
  | { status: "published"; season: string; gameweek: number; file: string; recap: Recap; written: boolean };

export async function publishRecap(options: PublishOptions): Promise<PublishResult> {
  const { source, model, contentDir } = options;
  const log = options.log ?? (() => {});

  const { season, events, eventStatus, details } = await source.overview();
  // Also validates what is already published: a broken recap folder stops the run here.
  const published = loadRecaps(contentDir)
    .filter((r) => r.season === season)
    .map((r) => r.gameweek);
  const selection = selectGameweek({ events, eventStatus, published, requested: options.gameweek, details });
  if (selection.gameweek === null) return { status: "nothing-to-do", season, reason: selection.reason };
  const { gameweek } = selection;
  const file = recapFile(contentDir, season, gameweek);
  if (options.selectOnly) return { status: "selected", season, gameweek, file };

  if (!model) throw new Error("publishRecap needs a model unless selectOnly is set.");
  const context = buildGameweekContext(gameweek, await source.sources(gameweek));
  if (context.season !== season) {
    throw new PublishError(`The snapshot is from the ${context.season} season, but FPL's events are from ${season}.`);
  }
  log(`Writing the gameweek ${gameweek} recap with ${model.id}...`);
  const recap = await runRecapAgent({ context, model, limits: options.limits, now: options.now });

  if (recap.run?.fallback || !recap.checks.passed) {
    const why = recap.run?.fallbackReason ?? "the checker rejected it";
    const issues = recap.run?.attempts.flatMap((a) => a.issues.map((i) => `  - attempt ${a.attempt}, ${i.where}: ${i.message}`)) ?? [];
    throw new PublishError(
      `Not published: the model's recap of gameweek ${gameweek} didn't pass the checker (${why}), ` +
        `so the run fell back to the template, which is never published.` +
        (issues.length ? `\nThe checker's complaints:\n${issues.join("\n")}` : ""),
    );
  }

  if (!options.dryRun) {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(recap, null, 2)}\n`);
    renameSync(tmp, file);
    // Read back the way the build reads it, so a recap the build would refuse is never left behind.
    loadRecaps(contentDir);
  }
  return { status: "published", season, gameweek, file, recap, written: !options.dryRun };
}

const OUTCOME: Record<NonNullable<Recap["run"]>["outcome"], string> = {
  "first-try": "passed on the first try",
  "after-retry": "passed after one retry",
  fallback: "fell back to the template",
};

/** The recap as plain text: "# headline", then a block per card (or paragraph, for a version 1 recap). */
export function recapText(recap: RecapContent): string {
  return recapToText(recap);
}

/** One line on model, cost, checker, tool calls and time. */
export function recapStats(recap: Recap): string {
  const run = recap.run;
  const cost = run && !run.priced ? "unknown (the model has no entry in the price table)" : `$${recap.costUsd.toFixed(2)}`;
  return (
    `Model \`${recap.model}\` · cost ${cost} · checker ${run ? OUTCOME[run.outcome] : recap.checks.passed ? "passed" : "failed"} ` +
    `(${recap.checks.numbersChecked} numbers and ${recap.checks.namesChecked} names verified) · ` +
    `${recap.usage.toolCalls} tool calls · ${recap.usage.inputTokens.toLocaleString("en-GB")} input and ` +
    `${recap.usage.outputTokens.toLocaleString("en-GB")} output tokens · ${(recap.timing.durationMs / 1000).toFixed(0)}s`
  );
}

/** The recap pull request's description: the whole recap, readable on a phone, then how it was made and what to do. */
export function recapPullRequestBody(recap: Recap, file: string): string {
  return [
    `The AI recap of Gameweek ${recap.gameweek} (${recap.season.replace("-", "/")}), written by the recap workflow. **Merging publishes it** on fantasyplstats.com.`,
    "",
    "---",
    "",
    recapText(recap).replace(/^# /, "## "),
    "",
    "---",
    "",
    recapStats(recap) + ".",
    "",
    `Every number and name above was checked against the tool results in \`${file}\`: each card cites the results in its \`evidence\` list, and the page shows the cards as graphics.`,
    "",
    "**To publish:** read it, and merge if it's right. Hand edits to the file aren't re-checked, so for a different recap close this PR, delete its branch and run the Recap workflow again.",
    "",
    "CI was started by the recap workflow (a PR opened by the workflow doesn't trigger it by itself). There's no Azure preview for a PR opened by a workflow: close and reopen this PR to get one.",
  ].join("\n");
}

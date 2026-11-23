// Record raw FPL responses for settled gameweeks into test/fixtures/gameweeks/,
// for the recap eval harness (PLAN.md step 5b, item 2). Not part of the build.
//
//   npx tsx scripts/record-gameweeks.ts                # GW1–12, settled ones only
//   npx tsx scripts/record-gameweeks.ts --to 10        # GW1–10
//
// Options:
//   --from <n>, --to <n>   gameweek range (default 1–12)
//   --out <dir>            output folder (default test/fixtures/gameweeks)
//   --allow-unsettled      also record gameweeks that are not yet finished and
//                          data-checked (their points are provisional; avoid)
//
// FPL_BASE_URL overrides the API root. Every request goes through one limiter
// (at most 5 in flight). See test/fixtures/gameweeks/README.md for the layout.

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  DEFAULT_FPL_BASE_URL,
  FplRequestError,
  createFplClient,
  createLimiter,
  type HistoryEntry,
} from "../src/lib/fpl";

const CONCURRENCY = 5;
const RETRIES = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; FantasyPLStats/1.0)";

// Light checks for the endpoints src/lib/fpl has no schema for yet. The
// recorded file is the raw body, not the parsed result, so unknown keys stay.
const liveSchema = z.object({
  elements: z.array(
    z.looseObject({
      id: z.number().int().positive(),
      stats: z.looseObject({ minutes: z.number().int(), total_points: z.number().int() }),
      explain: z.array(z.looseObject({ fixture: z.number().int() })),
    }),
  ),
});
const dreamTeamSchema = z.looseObject({
  top_player: z.object({ id: z.number().int(), points: z.number().int() }),
  team: z.array(z.looseObject({ element: z.number().int(), points: z.number().int() })).length(11),
});
const eventFixturesSchema = z.array(
  z.looseObject({ id: z.number().int(), event: z.number().int(), finished: z.boolean() }),
);
const rawEventSchema = z.looseObject({
  id: z.number().int(),
  finished: z.boolean(),
  data_checked: z.boolean(),
});
const rawBootstrapSchema = z.looseObject({
  events: z.array(rawEventSchema).min(1),
  teams: z.array(z.looseObject({ id: z.number().int() })).min(2),
  element_types: z.array(z.looseObject({ id: z.number().int() })).min(1),
  elements: z.array(z.looseObject({ id: z.number().int() })).min(1),
});

/** Identity fields kept from bootstrap-static; everything else changes daily. */
const TEAM_FIELDS = ["id", "code", "name", "short_name"] as const;
const POSITION_FIELDS = ["id", "singular_name", "singular_name_short", "plural_name"] as const;
const PLAYER_FIELDS = [
  "id",
  "code",
  "first_name",
  "second_name",
  "web_name",
  "team",
  "team_code",
  "element_type",
] as const;

function pick(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

const gwDir = (gw: number) => `gw${String(gw).padStart(2, "0")}`;

/**
 * JSON with one array item (or one object entry) per line: small like minified
 * JSON, but greppable and readable in a diff.
 */
function lines(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length ? `[\n${value.map((item) => JSON.stringify(item)).join(",\n")}\n]` : "[]";
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length
      ? `{\n${entries.map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(",\n")}\n}`
      : "{}";
  }
  return JSON.stringify(value);
}

function writeJson(file: string, text: string) {
  writeFileSync(file, `${text}\n`);
}

function folderSize(dir: string): number {
  return readdirSync(dir).reduce((total, name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return total + (stat.isDirectory() ? folderSize(path) : stat.size);
  }, 0);
}

class RecordValidationError extends Error {}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "1" },
      to: { type: "string", default: "12" },
      out: { type: "string", default: "test/fixtures/gameweeks" },
      "allow-unsettled": { type: "boolean", default: false },
    },
  });
  const from = Number(values.from);
  const to = Number(values.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 38 || from > to) {
    throw new Error(`Invalid gameweek range ${values.from}–${values.to}`);
  }
  const out = resolve(values.out!);
  const root = (process.env.FPL_BASE_URL || DEFAULT_FPL_BASE_URL).replace(/\/+$/, "");
  const started = Date.now();

  // One limiter for every request, whether it goes through createFplClient or
  // not, so no more than CONCURRENCY requests are ever in flight.
  const limit = createLimiter(CONCURRENCY);
  let requests = 0;
  const throttledFetch: typeof fetch = (input, init) =>
    limit(() => {
      requests++;
      return globalThis.fetch(input, init);
    });

  // Raw bodies the client fetched, by URL: the client returns parsed (stripped)
  // data, but the events array is recorded as FPL sent it.
  const rawBodies = new Map<string, unknown>();
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await throttledFetch(input, init);
    if (response.ok) {
      const text = await response.clone().text();
      try {
        rawBodies.set(String(input instanceof Request ? input.url : input), JSON.parse(text));
      } catch {
        // Not JSON (FPL is updating): the client retries it.
      }
    }
    return response;
  };
  const client = createFplClient({ baseUrl: root, fetch: recordingFetch, userAgent: USER_AGENT });

  // The client has no methods for these endpoints yet, so fetch them through
  // the same limiter, with the client's retry rules (network errors, 429, 5xx
  // and non-JSON bodies are retried with backoff).
  async function getRaw<T>(path: string, schema: z.ZodType<T>): Promise<unknown> {
    const url = `${root}/${path}`;
    for (let tries = 0; ; tries++) {
      try {
        const response = await throttledFetch(url, {
          headers: { Accept: "application/json", "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(20_000),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new FplRequestError(
            `Request to ${url} returned HTTP ${response.status}`,
            url,
            response.status,
            response.status === 429 || response.status >= 500,
          );
        }
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw new FplRequestError(`Response from ${url} is not JSON`, url, response.status, true);
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          throw new RecordValidationError(`FPL response from ${url} failed validation: ${parsed.error.message}`);
        }
        return body;
      } catch (error) {
        // Network errors and timeouts (not FplRequestError) are retryable too.
        const retryable =
          !(error instanceof RecordValidationError) &&
          (!(error instanceof FplRequestError) || error.retryable);
        if (!retryable || tries >= RETRIES) throw error;
        await sleep(1_000 * 2 ** tries * (0.75 + Math.random() * 0.5));
      }
    }
  }

  // 1. bootstrap-static: validated by the client, recorded raw.
  await client.getBootstrap();
  // Validate, but keep FPL's own objects (parse output would reorder keys).
  const bootstrapBody = rawBodies.get(`${root}/bootstrap-static/`);
  rawBootstrapSchema.parse(bootstrapBody);
  const bootstrapRaw = bootstrapBody as z.infer<typeof rawBootstrapSchema>;

  const requested = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const skipped: Array<{ gameweek: number; reason: string }> = [];
  const gameweeks = requested.filter((gw) => {
    const event = bootstrapRaw.events.find((e) => e.id === gw);
    if (!event) {
      skipped.push({ gameweek: gw, reason: "not in bootstrap-static events" });
      return false;
    }
    if (!(event.finished && event.data_checked) && !values["allow-unsettled"]) {
      skipped.push({
        gameweek: gw,
        reason: `not settled yet (finished: ${event.finished}, data_checked: ${event.data_checked})`,
      });
      return false;
    }
    return true;
  });
  if (!gameweeks.length) throw new Error("No settled gameweeks in the requested range.");

  // 2. Per gameweek: fixtures, live and dream team.
  const perGameweek = await Promise.all(
    gameweeks.map(async (gw) => {
      const [fixtures, live, dreamTeam] = await Promise.all([
        getRaw(`fixtures/?event=${gw}`, eventFixturesSchema),
        getRaw(`event/${gw}/live/`, liveSchema),
        getRaw(`dream-team/${gw}/`, dreamTeamSchema),
      ]);
      return { gw, fixtures, live: liveSchema.parse(live), liveRaw: live, dreamTeam };
    }),
  );

  // Players who played (minutes > 0) in any recorded gameweek.
  const played = new Set<number>();
  for (const { live } of perGameweek) {
    for (const element of live.elements) if (element.stats.minutes > 0) played.add(element.id);
  }

  // 3. element-summary history for those players, through the client (which
  // validates it and keeps only the fields step 5a's schema keeps).
  const last = Math.max(...gameweeks);
  const ids = [...played].sort((a, b) => a - b);
  const history: Record<string, HistoryEntry[]> = {};
  await Promise.all(
    ids.map(async (id) => {
      const summary = await client.getElementSummary(id);
      history[id] = summary.history.filter((row) => row.round <= last);
    }),
  );

  // Write everything only after every request has succeeded.
  mkdirSync(out, { recursive: true });
  const playersOut = bootstrapRaw.elements.map((row) => pick(row, PLAYER_FIELDS));
  const bootstrapOut = {
    events: bootstrapRaw.events,
    teams: bootstrapRaw.teams.map((row) => pick(row, TEAM_FIELDS)),
    element_types: bootstrapRaw.element_types.map((row) => pick(row, POSITION_FIELDS)),
    elements: playersOut,
  };
  writeJson(
    join(out, "bootstrap-static.json"),
    `{\n"events": ${lines(bootstrapOut.events)},\n"teams": ${lines(bootstrapOut.teams)},\n` +
      `"element_types": ${lines(bootstrapOut.element_types)},\n"elements": ${lines(bootstrapOut.elements)}\n}`,
  );

  for (const { gw, fixtures, liveRaw, dreamTeam } of perGameweek) {
    const dir = join(out, gwDir(gw));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // Drop players with no minutes and no points: they add ~half the file and
    // nothing else (an absent player played 0 minutes and scored 0).
    const elements = (liveRaw as { elements: Array<{ stats: { minutes: number; total_points: number } }> })
      .elements.filter((e) => e.stats.minutes > 0 || e.stats.total_points !== 0);
    writeJson(join(dir, "fixtures.json"), lines(fixtures));
    writeJson(join(dir, "live.json"), `{"elements": ${lines(elements)}}`);
    writeJson(join(dir, "dream-team.json"), JSON.stringify(dreamTeam, null, 2));
  }

  const sortedHistory = Object.fromEntries(ids.map((id) => [String(id), history[id]]));
  writeJson(join(out, "element-history.json"), lines(sortedHistory));

  const manifest = {
    recordedAt: new Date().toISOString(),
    source: root,
    gameweeks,
    skipped,
    players: playersOut.length,
    historyPlayers: ids.length,
    requests,
  };
  writeJson(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const mb = (folderSize(out) / 1024 / 1024).toFixed(2);
  console.log(
    `Recorded GW${gameweeks.join(", GW")} (${ids.length} players' history, ${requests} requests, ${seconds}s) ` +
      `into ${relative(process.cwd(), out)}: ${mb} MB.`,
  );
  for (const { gameweek, reason } of skipped) console.log(`Skipped GW${gameweek}: ${reason}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

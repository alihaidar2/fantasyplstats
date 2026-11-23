// Records the FPL data the recap tests run against into test/fixtures/recap/.
// It calls the live FPL API (about 700 throttled requests, like a full
// `npm run fetch`), so run it by hand when the fixtures need refreshing:
//
//   npx tsx scripts/record-recap-fixtures.ts
//
// Options: --gameweeks 3,4 (which gameweeks to record; they must be finished)
//          --out <dir>     (default test/fixtures/recap)
//
// What it writes is described in test/fixtures/recap/README.md. After
// re-recording, expect to update the numbers the recap tests assert on.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  DEFAULT_FPL_BASE_URL,
  buildSnapshot,
  createFplClient,
  dreamTeamSchema,
  eventLiveSchema,
  eventStatusSchema,
  gameweekFixturesSchema,
  parseSnapshot,
  trimLive,
  type Snapshot,
} from "../src/lib/fpl";

/** Non-playing players are kept when at least this share of managers owned them. */
const MIN_OWNERSHIP = 0.05;

const baseUrl = (process.env.FPL_BASE_URL ?? DEFAULT_FPL_BASE_URL).replace(/\/+$/, "");

async function getRaw(path: string): Promise<unknown> {
  const url = `${baseUrl}/${path}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; FantasyPLStats/1.0)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Request to ${url} returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const { values } = parseArgs({
    options: {
      gameweeks: { type: "string", default: "3,4" },
      out: { type: "string", default: "test/fixtures/recap" },
    },
  });
  const gameweeks = values.gameweeks!.split(",").map(Number).sort((a, b) => a - b);
  if (gameweeks.length === 0 || gameweeks.some((gw) => !Number.isInteger(gw) || gw < 1 || gw > 38)) {
    throw new Error(`Invalid --gameweeks: ${values.gameweeks}`);
  }
  const out = resolve(values.out!);
  const last = gameweeks.at(-1)!;
  // The snapshot runs past the recorded gameweeks on purpose, so tests can
  // check that a recap of an earlier gameweek never sees the later data.
  const historyThrough = last + 1;
  const eventsThrough = last + 2;

  const { snapshot: full } = await buildSnapshot({
    client: createFplClient({ baseUrl }),
    forceFull: true,
    log: (message) => console.log(message),
  });

  const keep = new Set<number>();
  const raw: Record<string, unknown> = {};
  for (const gw of gameweeks) {
    const event = full.bootstrap.events.find((e) => e.id === gw);
    if (!event?.finished) throw new Error(`Gameweek ${gw} isn't finished, so it can't be recorded.`);

    const live = await getRaw(`event/${gw}/live/`);
    const fixtures = await getRaw(`fixtures/?event=${gw}`);
    const dreamTeam = await getRaw(`dream-team/${gw}/`);
    raw[`live-${gw}.json`] = live;
    raw[`fixtures-${gw}.json`] = fixtures;
    raw[`dream-team-${gw}.json`] = dreamTeam;

    for (const e of eventLiveSchema.parse(live).elements) if (e.stats.minutes > 0) keep.add(e.id);
    for (const f of gameweekFixturesSchema.parse(fixtures)) {
      for (const stat of f.stats) for (const row of [...stat.h, ...stat.a]) keep.add(row.element);
    }
    for (const d of dreamTeamSchema.parse(dreamTeam).team) keep.add(d.element);
    for (const id of [event.most_captained, event.most_transferred_in, event.top_element_info?.id]) {
      if (id) keep.add(id);
    }
    for (const [id, summary] of Object.entries(full.summaries)) {
      const row = summary.history.find((h) => h.round === gw);
      if (row && event.ranked_count > 0 && row.selected / event.ranked_count >= MIN_OWNERSHIP) keep.add(Number(id));
    }
  }
  const eventStatus = eventStatusSchema.parse(await getRaw("event-status/"));
  raw["event-status.json"] = eventStatus;

  // Trim: the kept players, the first gameweeks, and GW `last` as the current
  // one. Match stats name only kept players (so other gameweeks' stats are
  // partial), teams of the week are the recorded gameweeks' (complete, since
  // their players are all kept), and the live data is GW `last`'s with the
  // recorded event-status, which describes a later gameweek.
  const elements = full.bootstrap.elements.filter((e) => keep.has(e.id));
  const lastLive = eventLiveSchema.parse(raw[`live-${last}.json`]);
  lastLive.elements = lastLive.elements.filter((e) => keep.has(e.id));
  const snapshot: Snapshot = parseSnapshot({
    ...full,
    bootstrap: {
      ...full.bootstrap,
      events: full.bootstrap.events
        .filter((e) => e.id <= eventsThrough)
        .map((e) => ({
          ...e,
          is_previous: e.id === last - 1,
          is_current: e.id === last,
          is_next: e.id === last + 1,
        })),
      elements,
    },
    fixtures: full.fixtures
      .filter((f) => f.event !== null && f.event <= eventsThrough)
      .map((f) => ({
        ...f,
        stats: f.stats.map((s) => ({
          identifier: s.identifier,
          h: s.h.filter((r) => keep.has(r.element)),
          a: s.a.filter((r) => keep.has(r.element)),
        })),
      })),
    dreamTeams: Object.fromEntries(
      gameweeks.map((gw) => [gw, dreamTeamSchema.parse(raw[`dream-team-${gw}.json`])]),
    ),
    live: trimLive(last, lastLive, eventStatus),
    summaries: Object.fromEntries(
      elements.map((e) => [
        e.id,
        { history: full.summaries[e.id].history.filter((h) => h.round <= historyThrough) },
      ]),
    ),
  });

  mkdirSync(out, { recursive: true });
  const write = (name: string, data: unknown) => {
    const json = JSON.stringify(data);
    writeFileSync(resolve(out, name), `${json}\n`);
    console.log(`${name}: ${(json.length / 1024).toFixed(0)} KB`);
  };
  write("snapshot.json", snapshot);
  for (const [name, data] of Object.entries(raw)) {
    if (name.startsWith("live-")) {
      const live = data as { elements: { id: number }[] };
      write(name, { ...live, elements: live.elements.filter((e) => keep.has(e.id)) });
    } else {
      write(name, data);
    }
  }
  console.log(
    `Recorded gameweeks ${gameweeks.join(", ")} at ${snapshot.generatedAt}: ${elements.length} of ` +
      `${full.bootstrap.elements.length} players, history to GW${historyThrough}, events to GW${eventsThrough}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

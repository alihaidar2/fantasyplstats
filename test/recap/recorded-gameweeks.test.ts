import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  dreamTeamSchema,
  elementSchema,
  elementTypeSchema,
  eventLiveSchema,
  eventSchema,
  gameweekFixturesSchema,
  historyEntrySchema,
  teamSchema,
} from "../../src/lib/fpl";
import { buildGameweekContext, type GameweekSources } from "../../src/lib/recap/context";
import { createRecapSession } from "../../src/lib/recap/session";

// The eval harness (PLAN.md step 5b item 2) will replay the gameweeks
// recorded in test/fixtures/gameweeks/. That recording is slimmer than a
// snapshot (players' identity fields only, live files without players who
// didn't play), so this checks the context and every tool work from it, and
// pins the three things its recording turned up.

const DIR = path.join(__dirname, "..", "fixtures", "gameweeks");
const read = (name: string): unknown => JSON.parse(readFileSync(path.join(DIR, name), "utf8"));
const folder = (gameweek: number) => `gw${String(gameweek).padStart(2, "0")}`;

const RECORDED = z.object({ gameweeks: z.array(z.number().int()) }).parse(read("manifest.json")).gameweeks;

const bootstrap = z
  .object({
    events: z.array(eventSchema),
    teams: z.array(teamSchema),
    element_types: z.array(elementTypeSchema),
    elements: z.array(
      elementSchema.pick({ id: true, first_name: true, second_name: true, web_name: true, team: true, element_type: true }),
    ),
  })
  .parse(read("bootstrap-static.json"));
const histories = z.record(z.string(), z.array(historyEntrySchema)).parse(read("element-history.json"));
const fixturesOf = new Map(RECORDED.map((gw) => [gw, gameweekFixturesSchema.parse(read(`${folder(gw)}/fixtures.json`))]));

/** The recording as the context's sources. `through` cuts it off as if recorded straight after that gameweek. */
function recordedSources(gameweek: number, through = Math.max(...RECORDED)): GameweekSources {
  return {
    snapshot: {
      bootstrap: {
        ...bootstrap,
        events: bootstrap.events.map((e) =>
          e.id <= through
            ? e
            : { ...e, finished: false, data_checked: false, average_entry_score: 0, highest_score: null, most_captained: null, most_transferred_in: null, top_element_info: null, chip_plays: [], ranked_count: 0 },
        ),
      },
      fixtures: RECORDED.filter((gw) => gw <= through).flatMap((gw) => fixturesOf.get(gw)!),
      summaries: Object.fromEntries(
        Object.entries(histories).map(([id, history]) => [id, { history: history.filter((h) => h.round <= through) }]),
      ),
    },
    live: eventLiveSchema.parse(read(`${folder(gameweek)}/live.json`)),
    fixtures: structuredClone(fixturesOf.get(gameweek)!),
    dreamTeam: dreamTeamSchema.parse(read(`${folder(gameweek)}/dream-team.json`)),
    eventStatus: null,
  };
}

const TOUR = (context: ReturnType<typeof buildGameweekContext>): [string, unknown][] => [
  ["gameweek_summary", {}],
  ["top_performers", {}],
  ["player_story", { player: context.players.reduce((a, b) => (b.gw.points > a.gw.points ? b : a)).ref }],
  ["find_players", { sortBy: "ownership" }],
  ["ownership_outcomes", {}],
  ["expected_vs_actual", { scope: "season" }],
  ["defensive_contributions", {}],
  ["team_story", { team: context.teams[0].name }],
  ["discipline_and_availability", {}],
  ["price_changes", {}],
  ["season_records", {}],
];

function tour(gameweek: number, through?: number) {
  const session = createRecapSession(buildGameweekContext(gameweek, recordedSources(gameweek, through)));
  for (const [tool, input] of TOUR(session.context)) session.call(tool, input);
  return session;
}

describe("the gameweeks recorded for the evals", () => {
  it("are there", () => {
    expect(RECORDED.length).toBeGreaterThanOrEqual(10);
    expect(RECORDED[0]).toBe(1);
  });

  it.each(RECORDED)("GW%i: every tool runs and returns compact, readable results", (gameweek) => {
    const session = tour(gameweek);
    expect(session.context).toMatchObject({ season: "2026-27", gameweek, isLatest: false });
    for (const entry of session.evidence) {
      const json = JSON.stringify(entry.result);
      expect(entry.ok, `${entry.tool}: ${json.slice(0, 200)}`).toBe(true);
      expect(json.length, entry.tool).toBeLessThan(6000);
      expect(json, entry.tool).not.toContain("null");
    }
  });

  it.each(RECORDED.slice(0, -1))("GW%i: later gameweeks in the recording change nothing", (gameweek) => {
    const fromAll = tour(gameweek).evidence;
    const atTheTime = tour(gameweek, gameweek).evidence;
    for (let i = 0; i < fromAll.length; i++) {
      expect(fromAll[i].result, fromAll[i].tool).toEqual(atTheTime[i].result);
    }
  });

  it("reproduce the facts in a reference story (GW5)", () => {
    // evals/references/2026-27/gw05.md
    const { evidence } = tour(5);
    expect(evidence[0].result).toMatchObject({
      managers: { averageScore: 48, highestScore: 126 },
      topScorer: { player: "Brobbey", team: "Sunderland", position: "FWD", points: 17 },
      mostCaptained: { player: "Haaland", points: 6, ownedBy: 7989349 },
      mostTransferredIn: { player: "Gibbs-White", points: 2 },
    });
    expect((evidence[0].result as { matches: unknown[] }).matches).toContainEqual(
      expect.objectContaining({ home: "Man City", away: "Sunderland", score: "5-3" }),
    );
  });
});

describe("findings from recording GW1-10", () => {
  it("1. a player's club is the one they played for that gameweek, not today's", () => {
    let moved = 0;
    for (const gameweek of RECORDED) {
      const sources = recordedSources(gameweek);
      const context = buildGameweekContext(gameweek, sources);
      const fixtureById = new Map(sources.snapshot.fixtures.map((f) => [f.id, f]));
      for (const player of context.players) {
        const row = histories[player.id]?.filter((h) => h.round <= gameweek).at(-1);
        if (!row) continue;
        const fixture = fixtureById.get(row.fixture)!;
        const clubThen = row.was_home ? fixture.team_h : fixture.team_a;
        expect(player.teamId, `${player.name} in GW${gameweek}`).toBe(clubThen);
        if (clubThen !== bootstrap.elements.find((e) => e.id === player.id)!.team) moved++;
      }
    }
    // The recording has players whose club today differs from their club then.
    expect(moved).toBeGreaterThan(0);
  });

  it("2. gameweek 1 has no transfer stories, though FPL fills most_transferred_in in", () => {
    expect(bootstrap.events.find((e) => e.id === 1)!.most_transferred_in).not.toBeNull();
    const { context, evidence } = tour(1);
    expect(context.hasTransfers).toBe(false);
    const result = (tool: string) => evidence.find((e) => e.tool === tool)!.result as Record<string, unknown>;

    expect(result("gameweek_summary")).not.toHaveProperty("mostTransferredIn");
    expect(result("gameweek_summary").transfersNote).toMatch(/Gameweek 1 has no transfers/);
    expect(result("ownership_outcomes")).not.toHaveProperty("mostBoughtBeforeDeadline");
    expect(result("ownership_outcomes")).not.toHaveProperty("mostSoldBeforeDeadline");
    expect(result("ownership_outcomes").transfersNote).toMatch(/Gameweek 1 has no transfers/);
    expect(Object.keys(result("price_changes"))).toEqual(["gameweek", "note"]);
    expect(JSON.stringify(evidence.map((e) => e.result))).not.toMatch(/netTransfersIn|priceChange/);

    // From gameweek 2 on they are back.
    expect(tour(2).evidence[0].result).toHaveProperty("mostTransferredIn");
  });

  it("3. an owned player missing from the live file counts as not having played", () => {
    // GW5: João Pedro, owned by 7.3 million, played 0 minutes, so the recorded live file has no entry for him.
    const sources = recordedSources(5);
    const joaoPedro = bootstrap.elements.find((e) => e.web_name === "João Pedro")!;
    expect(sources.live.elements.some((e) => e.id === joaoPedro.id)).toBe(false);

    const session = createRecapSession(buildGameweekContext(5, sources));
    expect(session.context.playerById.get(joaoPedro.id)!.gw).toMatchObject({ minutes: 0, points: 0 });

    const outcomes = session.call("ownership_outcomes", {}).result as {
      mostOwned: Record<string, unknown>[];
      ownedButDidNotPlay: Record<string, unknown>[];
    };
    expect(outcomes.ownedButDidNotPlay[0]).toMatchObject({ player: "João Pedro", ownedBy: 7300631, minutes: 0, points: 0 });
    expect(outcomes.mostOwned).toContainEqual(expect.objectContaining({ player: "João Pedro", minutes: 0, returned: false }));

    expect(session.call("player_story", { player: "João Pedro" }).result).toMatchObject({
      thisGameweek: { minutes: 0, points: 0 },
      ownedBy: 7300631,
      netTransfersIn: -487412,
    });
    // Not among the gameweek's scorers, where a zero would be noise.
    const top = session.call("top_performers", { team: "Chelsea", limit: 20 }).result as { players: { player: string }[] };
    expect(top.players.map((p) => p.player)).not.toContain("João Pedro");
  });
});

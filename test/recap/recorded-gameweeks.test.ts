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
  ["story_candidates", {}],
  ["captaincy", {}],
  ["transfer_story", {}],
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

describe("captaincy, transfers and runs across the recorded gameweeks", () => {
  const call = (gameweek: number, tool: string, input: unknown = {}) => {
    const session = createRecapSession(buildGameweekContext(gameweek, recordedSources(gameweek)));
    const entry = session.call(tool, input);
    expect(entry.ok, JSON.stringify(entry.result).slice(0, 200)).toBe(true);
    return entry.result as Record<string, unknown>;
  };

  it("captaincy: the most-captained player's score, doubled and tripled, and a season-high chip count (GW3)", () => {
    // evals/references/2026-27/gw03.md, story 1
    expect(call(3, "captaincy")).toMatchObject({
      mostCaptained: {
        player: "Haaland",
        points: 9,
        captainPoints: 18,
        tripleCaptainPoints: 27,
        ownedBy: 7594638,
        gameweeksInARowAsMostCaptained: 3,
        wasTheGameweekTopScorer: false,
      },
      mostViceCaptained: { player: "B.Fernandes", points: 2, outcome: "blanked" },
      tripleCaptain: {
        played: 1787071,
        mostPlayedInAGameweekSoFar: true,
        previousHigh: { chip: "Triple Captain", gameweek: 1, played: 250816 },
      },
    });
  });

  it("captaincy: a chip count below an earlier gameweek's is not flagged (GW4 after GW3's Triple Captains)", () => {
    expect(call(4, "captaincy")).toMatchObject({
      tripleCaptain: { played: 323226, mostPlayedInAGameweekSoFar: false, previousHigh: { gameweek: 3, played: 1787071 } },
    });
  });

  it("captaincy: gameweek 1 has nothing earlier to compare its chips with", () => {
    const result = call(1, "captaincy") as { chips: Record<string, unknown>[] };
    expect(result.chips.length).toBeGreaterThan(0);
    for (const chip of result.chips) expect(chip).not.toHaveProperty("mostPlayedInAGameweekSoFar");
  });

  it("transfer_story: what the most-transferred-in player then scored (GW3 and GW5)", () => {
    // evals/references/2026-27/gw03.md, story 2
    const gw3 = call(3, "transfer_story") as { biggestNetTransfersIn: Record<string, unknown>[]; biggestNetTransfersOut: Record<string, unknown>[] };
    expect(gw3).toMatchObject({
      allManagers: { transfersMade: 27412065, mostTransfersInAGameweekSoFar: true, previousHigh: { gameweek: 2, transfersMade: 11562127 } },
      mostTransferredIn: { player: "Cherki", points: 3, minutes: 65, netTransfersIn: 1783948, biggestNetTransfersInOfTheSeasonSoFar: true },
    });
    // Only the gameweek's biggest mover can hold the season high.
    expect(gw3.biggestNetTransfersIn[0]).toMatchObject({ player: "Cherki", biggestNetTransfersInOfTheSeasonSoFar: true });
    expect(gw3.biggestNetTransfersIn[1]).toMatchObject({ biggestNetTransfersInOfTheSeasonSoFar: false });
    for (const row of gw3.biggestNetTransfersOut) {
      expect(row.netTransfersOut).toBeGreaterThan(0);
      expect(row).not.toHaveProperty("netTransfersIn");
    }
    expect(call(5, "transfer_story")).toMatchObject({ mostTransferredIn: { player: "Gibbs-White", points: 2 } });
  });

  it("transfer_story: gameweek 1 has no transfers", () => {
    const result = call(1, "transfer_story");
    expect(result).not.toHaveProperty("biggestNetTransfersIn");
    expect(result.note).toMatch(/no transfers/);
  });

  it("season_records: chips, transfers and defensive contributions against the season so far (GW3)", () => {
    const records = call(3, "season_records") as {
      chipsThisGameweek: Record<string, unknown>[];
      defensiveContributions: Record<string, unknown>;
    };
    expect(records.chipsThisGameweek).toContainEqual(
      expect.objectContaining({ chip: "Triple Captain", played: 1787071, mostPlayedInAGameweekSoFar: true }),
    );
    expect(records).toMatchObject({ transfers: { transfersMade: 27412065, mostTransfersInAGameweekSoFar: true } });
    expect(records.defensiveContributions).toMatchObject({
      thisGameweek: { defensiveContribution: expect.any(Number) },
      mostInAGameweekSoFar: expect.any(Boolean),
      bestIndividualThisGameweek: { player: expect.any(String), defensiveContribution: expect.any(Number) },
      bestIndividualThisGameweekIsTheSeasonHigh: expect.any(Boolean),
    });
    // Gameweek 1 has nothing to be a high against.
    const first = call(1, "season_records") as { defensiveContributions: Record<string, unknown> };
    expect(first.defensiveContributions).not.toHaveProperty("mostInAGameweekSoFar");
    expect(first).not.toHaveProperty("transfers");
  });

  it("season_records: the defensive totals add up from the players' own figures", () => {
    for (const gameweek of [2, 6]) {
      const context = buildGameweekContext(gameweek, recordedSources(gameweek));
      const records = createRecapSession(context).call("season_records", {}).result as {
        defensiveContributions: { thisGameweek: { defensiveContribution: number }; bestIndividualThisGameweek: { defensiveContribution: number } };
      };
      const rows = context.players.flatMap((p) => p.rounds.filter((r) => r.gameweek === gameweek));
      expect(records.defensiveContributions.thisGameweek.defensiveContribution).toBe(rows.reduce((sum, r) => sum + r.defensiveContribution, 0));
      expect(records.defensiveContributions.bestIndividualThisGameweek.defensiveContribution).toBe(Math.max(...rows.map((r) => r.defensiveContribution)));
    }
  });

  it.each(RECORDED)("story_candidates GW%i: a ranked shortlist led by stories that reached the most managers", (gameweek) => {
    const context = buildGameweekContext(gameweek, recordedSources(gameweek));
    const result = createRecapSession(context).call("story_candidates", {}).result as {
      candidates: (Record<string, unknown> & { story: string; also?: string[]; player?: string; ref?: string })[];
    };
    expect(result.candidates.length).toBeGreaterThanOrEqual(5);
    expect(result.candidates.length).toBeLessThanOrEqual(8);
    // The captain's result is always on the list, and no player appears twice.
    const captain = context.playerById.get(context.event.mostCaptainedId!)!;
    const captainRow = result.candidates.find((c) => c.ref === captain.ref)!;
    expect([captainRow.story, ...(captainRow.also ?? [])].join("; ")).toMatch(/most-captained/);
    // No more than two of a kind, unless a story is one that is always listed.
    const always = /most-captained|top score|most-bought/;
    const kinds = result.candidates.filter((c) => !always.test([c.story, ...(c.also ?? [])].join("; "))).map((c) => c.story);
    for (const kind of new Set(kinds)) expect(kinds.filter((k) => k === kind).length, kind).toBeLessThanOrEqual(2);
    const refs = result.candidates.flatMap((c) => (c.ref ? [c.ref] : []));
    expect(new Set(refs).size).toBe(refs.length);
    // Every player's figures are that player's own this gameweek, and the ranking's scores stay out of the result.
    for (const c of result.candidates) {
      // A match's "score" is its scoreline; the ranking's number is never there.
      expect(typeof c.score).not.toBe("number");
      if (!c.ref) continue;
      const player = context.playerById.get(Number(c.ref.slice(1)))!;
      expect(c).toMatchObject({ player: player.name, points: player.gw.points, minutes: player.gw.minutes });
    }
    // The gameweek's top scorer is there too.
    const top = Math.max(...context.players.map((p) => p.gw.points));
    expect(result.candidates.some((c) => c.points === top)).toBe(true);
  });

  it("story_candidates: a high-scoring match is a story, with everyone who hauled in it (GW5)", () => {
    // evals/references/2026-27/gw05.md, story 1: Man City 5-3 Sunderland
    const { candidates } = call(5, "story_candidates", { limit: 12 }) as { candidates: Record<string, unknown>[] };
    const match = candidates.find((c) => c.story === "a standout match" && c.home === "Man City") as { hauls: { player: string; points: number }[] };
    expect(match).toMatchObject({ home: "Man City", away: "Sunderland", score: "5-3", goals: 8 });
    expect(match.hauls.map((h) => h.player)).toContain("Brobbey");
    for (const haul of match.hauls) expect(haul.points).toBeGreaterThanOrEqual(10);
  });

  it("story_candidates: lists a season high when one is set, and not otherwise", () => {
    const highs = (gameweek: number) =>
      (call(gameweek, "story_candidates") as { highsSetThisGameweek?: { high: string }[] }).highsSetThisGameweek ?? [];
    expect(highs(3)).toContainEqual(
      expect.objectContaining({ high: "most Triple Captain chips played in a gameweek so far", played: 1787071 }),
    );
    expect(highs(4).filter((h) => h.high.includes("Triple Captain"))).toEqual([]);
    // Gameweek 1 has nothing earlier to beat.
    expect(highs(1)).toEqual([]);
    // Each one agrees with season_records' own flag.
    for (const gameweek of RECORDED) {
      const records = call(gameweek, "season_records") as { thisGameweekHasTheMostGoalsSoFar?: boolean };
      expect(highs(gameweek).some((h) => h.high === "most goals in a gameweek so far"), `GW${gameweek}`).toBe(
        records.thisGameweekHasTheMostGoalsSoFar ?? false,
      );
    }
  });

  it("gameweek_summary: counts the matches", () => {
    expect(call(3, "gameweek_summary")).toMatchObject({ matchCount: 10, goals: 23 });
  });

  it("player_story: runs are counted back from this gameweek and match the weeks shown", () => {
    for (const gameweek of [4, 7, 10]) {
      const context = buildGameweekContext(gameweek, recordedSources(gameweek));
      const session = createRecapSession(context);
      for (const player of context.players.filter((p) => p.rounds.length >= 3).slice(0, 60)) {
        const story = session.call("player_story", { player: player.ref }).result as {
          lastFive: { gameweek: number; points: number; minutes: number; goals: number }[];
          streaks: Record<string, number>;
        };
        expect(story.lastFive.every((r) => r.gameweek <= gameweek)).toBe(true);
        const back = [...story.lastFive].reverse();
        const run = (test: (r: (typeof back)[number]) => boolean) => {
          const stop = back.findIndex((r) => !test(r));
          return stop === -1 ? back.length : stop;
        };
        const capped = (n: number) => Math.min(n, back.length);
        expect(capped(story.streaks.gameweeksInARowWithAGoal), player.name).toBe(run((r) => r.goals > 0));
        expect(capped(story.streaks.gameweeksInARowBlanking), player.name).toBe(run((r) => r.points <= 2));
        expect(capped(story.streaks.gameweeksInARowWithoutMinutes), player.name).toBe(run((r) => r.minutes === 0));
        // A run can't be both live and broken.
        expect(story.streaks.gameweeksInARowWithAGoal > 0 && story.streaks.gameweeksInARowBlanking > 0).toBe(false);
      }
    }
  });

  it("player_story: shows the ownership and transfer trend over the weeks it lists", () => {
    const story = call(5, "player_story", { player: "Haaland" }) as {
      lastFive: Record<string, unknown>[];
      trend: Record<string, unknown>;
    };
    expect(story.lastFive).toHaveLength(5);
    expect(story.lastFive[0]).toMatchObject({ gameweek: 1, ownedBy: expect.any(Number), ownership: expect.stringMatching(/%$/) });
    expect(story.lastFive[0]).not.toHaveProperty("netTransfersIn");
    expect(story.lastFive[4]).toMatchObject({ gameweek: 5, ownedBy: 7989349 });
    expect(story.trend).toMatchObject({ sinceGameweek: 1, ownershipThen: expect.any(String), ownershipNow: expect.any(String) });
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

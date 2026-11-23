import { describe, expect, it } from "vitest";
import { buildGameweekContext, type GameweekSources } from "../../src/lib/recap/context";
import { createRecapSession } from "../../src/lib/recap/session";
import { loadSources } from "./helpers";

// No hindsight: the evals replay past gameweeks from a later snapshot, so a
// GW3 recap must come out the same whether the snapshot was taken straight
// after GW3 or months later. The recorded snapshot runs to GW5 with GW4
// current, so it has plenty to leak.

const CALLS: [string, unknown][] = [
  ["gameweek_summary", {}],
  ["top_performers", {}],
  ["top_performers", { limit: 20, position: "DEF" }],
  ["top_performers", { team: "Man City", maxOwnershipPercent: 100 }],
  ["player_story", { player: "Haaland" }],
  ["player_story", { player: "Mitchell" }],
  ["player_story", { player: "B.Fernandes" }],
  ["find_players", {}],
  ["find_players", { sortBy: "season points", limit: 20 }],
  ["find_players", { sortBy: "ownership", limit: 20 }],
  ["find_players", { sortBy: "price", limit: 20 }],
  ["ownership_outcomes", { limit: 10 }],
  ["expected_vs_actual", {}],
  ["expected_vs_actual", { scope: "season", limit: 10 }],
  ["defensive_contributions", { limit: 20 }],
  ["team_story", { team: "Arsenal" }],
  ["team_story", { team: "Brighton" }],
  ["team_story", { team: "Coventry City" }],
  ["discipline_and_availability", { limit: 20 }],
  ["price_changes", { limit: 20 }],
  ["season_records", { limit: 10 }],
];

function run(gameweek: number, sources: GameweekSources) {
  const session = createRecapSession(buildGameweekContext(gameweek, sources));
  for (const [tool, input] of CALLS) session.call(tool, input);
  expect(session.evidence.filter((e) => !e.ok)).toEqual([]);
  return session.evidence;
}

/** The same sources as they would have looked straight after `gameweek`, with today's values scrambled. */
function withoutTheFuture(sources: GameweekSources, gameweek: number): GameweekSources {
  const past = structuredClone(sources);
  const { snapshot } = past;
  for (const summary of Object.values(snapshot.summaries)) {
    summary.history = summary.history.filter((h) => h.round <= gameweek);
  }
  for (const fixture of snapshot.fixtures) {
    if (fixture.event !== null && fixture.event > gameweek) {
      Object.assign(fixture, { started: false, finished: false, team_h_score: null, team_a_score: null });
    }
  }
  for (const event of snapshot.bootstrap.events) {
    if (event.id > gameweek) {
      Object.assign(event, {
        finished: false, data_checked: false, is_previous: false, is_current: false, is_next: false,
        average_entry_score: 0, highest_score: null, most_captained: null, most_transferred_in: null,
        top_element_info: null, chip_plays: [], ranked_count: 0,
      });
    }
  }
  // bootstrap-static's player fields describe the day the snapshot was taken.
  for (const element of snapshot.bootstrap.elements) {
    Object.assign(element, {
      status: "i", news: "Poisoned: out for 99 weeks", chance_of_playing_next_round: 0,
      now_cost: element.now_cost + 37, cost_change_event: 9, cost_change_start: -9,
      transfers_in_event: 999_999, transfers_out_event: 888_888,
      total_points: 999, points_per_game: "99.9", form: "99.9", selected_by_percent: "99.9",
      minutes: 9999, starts: 99, goals_scored: 99, assists: 99, clean_sheets: 99, bonus: 99, bps: 999,
      defensive_contribution: 999, expected_goals: "99.99", expected_assists: "99.99",
    });
  }
  past.eventStatus = null;
  return past;
}

describe("a tool asked about GW3 never returns GW4+ data", () => {
  const sources = loadSources(3);
  const later = run(3, sources);
  const atTheTime = run(3, withoutTheFuture(sources, 3));

  it("has later data in the snapshot to leak", () => {
    const history = Object.values(sources.snapshot.summaries).flatMap((s) => s.history);
    expect(history.some((h) => h.round === 4)).toBe(true);
    expect(history.some((h) => h.round === 5)).toBe(true);
    expect(sources.snapshot.bootstrap.events.find((e) => e.id === 4)).toMatchObject({ finished: true, is_current: true });
  });

  it("gives the same result from a later snapshot as from one taken at the time", () => {
    for (let i = 0; i < CALLS.length; i++) {
      expect(later[i].result, `${CALLS[i][0]} ${JSON.stringify(CALLS[i][1])}`).toEqual(atTheTime[i].result);
    }
  });

  it("mentions no later gameweek anywhere", () => {
    for (const entry of later) {
      const json = JSON.stringify(entry.result);
      expect(json, entry.tool).not.toMatch(/"(?:gameweek|bestScoreGameweek)":\s*(?:[4-9]|\d\d)\b/);
      expect(json, entry.tool).not.toMatch(/[Gg]ameweek (?:[4-9]|\d\d)\b/);
    }
  });

  it("uses season totals, prices and ownership as they stood, not today's", () => {
    const { snapshot } = sources;
    const haaland = snapshot.bootstrap.elements.find((e) => e.id === 411)!;
    const rows = snapshot.summaries[411].history;
    const upTo3 = rows.filter((h) => h.round <= 3);
    const story = later.find((e) => e.tool === "player_story")!.result as {
      price: string;
      ownedBy: number;
      season: { points: number; goals: number };
      lastFive: { gameweek: number }[];
    };
    expect(story.season.points).toBe(upTo3.reduce((sum, h) => sum + h.total_points, 0));
    expect(story.season.points).toBeLessThan(haaland.total_points);
    expect(story.season.goals).toBe(upTo3.reduce((sum, h) => sum + h.goals_scored, 0));
    expect(story.ownedBy).toBe(rows.find((h) => h.round === 3)!.selected);
    expect(story.price).toBe(`£${(rows.find((h) => h.round === 3)!.value / 10).toFixed(1)}m`);
    expect(story.lastFive.map((r) => r.gameweek)).toEqual([1, 2, 3]);
  });

  it("holds for GW4 too, where today's news is allowed but GW5 is not", () => {
    const gw4 = loadSources(4);
    const fromLater = run(4, gw4);
    const stripped = structuredClone(gw4);
    for (const summary of Object.values(stripped.snapshot.summaries)) {
      summary.history = summary.history.filter((h) => h.round <= 4);
    }
    for (const fixture of stripped.snapshot.fixtures) {
      if ((fixture.event ?? 0) > 4) Object.assign(fixture, { finished: false, team_h_score: null, team_a_score: null });
    }
    const then = run(4, stripped);
    for (let i = 0; i < CALLS.length; i++) {
      expect(fromLater[i].result, CALLS[i][0]).toEqual(then[i].result);
    }
  });
});

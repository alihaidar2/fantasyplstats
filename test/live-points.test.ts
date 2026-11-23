import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { trimLive, type Fixture, type Snapshot } from "../src/lib/fpl";
import {
  buildPointsPage,
  deriveRule,
  deriveRules,
  describeRule,
  Evidence,
  liveEvidence,
  pointAction,
  predict,
  RuleBook,
  type Observations,
  type Rule,
} from "../src/lib/stats/live-points";
import { buildFixtureSnapshot, loadRecordedGameweek } from "./fixture-client";

/** Observations from [value, points] pairs, each seen once. */
const obs = (pairs: [number, number][]): Observations => {
  const out: Observations = new Map();
  for (const [v, p] of pairs) {
    const counts = out.get(v) ?? new Map<number, number>();
    counts.set(p, (counts.get(p) ?? 0) + 1);
    out.set(v, counts);
  }
  return out;
};

describe("fitting a rule", () => {
  it("per unit", () => {
    expect(deriveRule("per", obs([[1, 5], [2, 10], [3, 15]]))).toEqual({ kind: "per", points: 5 });
    expect(deriveRule("per", obs([[1, 0]]))).toEqual({ kind: "per", points: 0 });
    expect(deriveRule("per", obs([[1, 5], [2, 9]]))).toEqual({ kind: "conflict" });
    expect(deriveRule("per", obs([[1, 5], [1, 4]]))).toEqual({ kind: "conflict" });
    expect(deriveRule("per", new Map())).toEqual({ kind: "unseen" });
  });

  it("per N", () => {
    expect(deriveRule("every", obs([[1, 0], [2, 0], [3, 1], [5, 1], [6, 2]]))).toEqual({ kind: "every", every: 3, points: 1 });
    expect(deriveRule("every", obs([[1, 0], [2, -1], [3, -1], [4, -2]]))).toEqual({ kind: "every", every: 2, points: -1 });
    // Only 3 saves = 1 point: every 2 or every 3 both fit.
    const ambiguous = deriveRule("every", obs([[3, 1]]));
    expect(ambiguous).toEqual({ kind: "every-ambiguous", options: [{ every: 2, points: 1 }, { every: 3, points: 1 }] });
    expect(describeRule(pointAction("saves"), ambiguous).text).toBe("+1 per 2–3");
    expect(deriveRule("every", obs([[1, 0], [4, 0]]))).toEqual({ kind: "none-yet", maxValue: 4 });
  });

  it("thresholds", () => {
    const minutes = deriveRule("step", obs([[1, 1], [45, 1], [59, 1], [60, 2], [90, 2]]));
    expect(minutes).toEqual({ kind: "step", levels: [{ points: 1, from: 1, to: 59 }, { points: 2, from: 60, to: 90 }] });
    expect(describeRule(pointAction("minutes"), minutes).text).toBe("+1, +2 from 60");
    const dc = deriveRule("step", obs([[3, 0], [10, 0], [16, 2]]));
    expect(describeRule(pointAction("defensive_contribution"), dc).text).toBe("+2 from 11–16");
    // A first level that starts above 1 says where it starts.
    const late = deriveRule("step", obs([[90, 2], [95, 2]]));
    expect(describeRule(pointAction("minutes"), late).text).toBe("+2 from 90");
    expect(deriveRule("step", obs([[5, 2], [10, 0]]))).toEqual({ kind: "conflict" });
    const unreached = deriveRule("step", obs([[5, 0], [9, 0]]));
    expect(unreached).toEqual({ kind: "none-yet", maxValue: 9 });
    // A threshold nobody has reached isn't "worth nothing".
    expect(describeRule(pointAction("defensive_contribution"), unreached).text).toBe("None yet");
    expect(describeRule(pointAction("goals_conceded"), { kind: "none-yet", maxValue: 4 }).text).toBe("0");
  });

  it("predicts only what the data supports", () => {
    const dc: Rule = { kind: "step", levels: [{ points: 0, from: 1, to: 10 }, { points: 2, from: 16, to: 20 }] };
    expect(predict(dc, 0)).toBe(0);
    expect(predict(dc, 9)).toBe(0);
    expect(predict(dc, 13)).toBeUndefined();
    expect(predict(dc, 25)).toBe(2);
    expect(predict({ kind: "every", every: 3, points: 1 }, 8)).toBe(2);
    expect(predict({ kind: "none-yet", maxValue: 4 }, 3)).toBe(0);
    expect(predict({ kind: "none-yet", maxValue: 4 }, 5)).toBeUndefined();
    expect(predict({ kind: "unseen" }, 1)).toBeUndefined();
    expect(predict({ kind: "every-ambiguous", options: [{ every: 2, points: 1 }, { every: 3, points: 1 }] }, 3)).toBe(1);
    expect(predict({ kind: "every-ambiguous", options: [{ every: 2, points: 1 }, { every: 3, points: 1 }] }, 4)).toBeUndefined();
  });
});

// The recorded 2026/27 GW1–10 (test/fixtures/gameweeks/).
const GAMEWEEKS = path.join(__dirname, "fixtures", "gameweeks");
const readGameweeksJson = (name: string) => JSON.parse(readFileSync(path.join(GAMEWEEKS, name), "utf8"));
const status = { status: [], leagues: "" };

describe("rules from every breakdown of GW1–10", () => {
  const bootstrap = readGameweeksJson("bootstrap-static.json") as Snapshot["bootstrap"];
  const evidence = new Evidence();
  let minWith = Infinity;
  let maxWithout = -Infinity;
  for (let gw = 1; gw <= 10; gw++) {
    const { fixtures, live } = loadRecordedGameweek(gw);
    const bounds = liveEvidence({ bootstrap, fixtures, live: trimLive(gw, live, status) }, evidence);
    minWith = Math.min(minWith, bounds.minWith ?? Infinity);
    maxWithout = Math.max(maxWithout, bounds.maxWithout ?? -Infinity);
  }
  const rules = new RuleBook(evidence);
  const text = (action: string) => [1, 2, 3, 4].map((p) => describeRule(pointAction(action), rules.get(p, action)).text);

  it("finds the scoring by position", () => {
    expect(text("goals_scored")).toEqual(["Not seen", "+6", "+5", "+4"]);
    expect(text("assists")).toEqual(["+3", "+3", "+3", "+3"]);
    expect(text("clean_sheets")).toEqual(["+4", "+4", "+1", "0"]);
    expect(text("goals_conceded")).toEqual(["-1 per 2", "-1 per 2", "0", "0"]);
    expect(text("saves")).toEqual(["+1 per 3", "Not seen", "Not seen", "Not seen"]);
    expect(text("penalties_saved")[0]).toBe("+5");
    expect(text("penalties_missed").slice(2)).toEqual(["-2", "-2"]);
    expect(text("yellow_cards")).toEqual(["-1", "-1", "-1", "-1"]);
    expect(text("red_cards").slice(1)).toEqual(["-3", "-3", "-3"]);
    expect(text("own_goals")).toEqual(["-2", "-2", "-2", "-2"]);
    expect(text("bonus")).toEqual(["+1", "+1", "+1", "+1"]);
    expect(text("minutes").slice(1)).toEqual(["+1, +2 from 60", "+1, +2 from 60", "+1, +2 from 60"]);
  });

  it("finds the defensive contribution thresholds the data shows, and no more", () => {
    expect(text("defensive_contribution")).toEqual(["Not seen", "+2 from 10", "+2 from 12", "+2 from 11–16"]);
  });

  it("bounds the minutes a clean sheet needs", () => {
    expect([maxWithout + 1, minWith]).toEqual([60, 60]);
  });
});

describe("rules from the season's history", () => {
  it("reproduce FPL's totals across GW1–10", () => {
    const bootstrap = readGameweeksJson("bootstrap-static.json") as Snapshot["bootstrap"];
    const history = readGameweeksJson("element-history.json") as Record<string, unknown[]>;
    const summaries = Object.fromEntries(Object.entries(history).map(([id, rows]) => [id, { history: rows }])) as Snapshot["summaries"];
    const fixtures: Fixture[] = [];
    for (let gw = 1; gw <= 10; gw++) fixtures.push(...loadRecordedGameweek(gw).fixtures);
    const { live } = loadRecordedGameweek(10);

    const { season, rules, evidence } = deriveRules({ bootstrap, fixtures, summaries, live: trimLive(10, live, status) });
    expect(season.rows).toBeGreaterThan(3000);
    expect(season.checked).toBeGreaterThan(1500);
    // Two players went off in stoppage time before a late goal; their minutes say 90.
    expect(season.checked - season.matched).toBeLessThanOrEqual(2);
    // GW10 alone has no red card for a defender; earlier matches supply it.
    expect(evidence.get("live", 2, "red_cards").size).toBe(0);
    expect(describeRule(pointAction("red_cards"), rules.get(2, "red_cards")).text).toBe("-3");
  });

  it("only infers from the season what no breakdown covers", () => {
    const evidence = new Evidence();
    evidence.add("live", 2, "goals_scored", 1, 6);
    evidence.add("season", 2, "goals_scored", 1, 6, 9);
    evidence.add("season", 2, "goals_scored", 1, 7, 1); // one stale row is outvoted
    expect(new RuleBook(evidence).get(2, "goals_scored")).toEqual({ kind: "per", points: 6 });
    evidence.add("season", 3, "red_cards", 1, -3, 1);
    evidence.add("season", 3, "red_cards", 1, -2, 1); // no clear majority: not stated
    expect(new RuleBook(evidence).get(3, "red_cards")).toEqual({ kind: "conflict" });
  });
});

describe("the points page", () => {
  let snapshot: Snapshot;
  beforeAll(async () => {
    snapshot = (await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"))).snapshot;
  });

  it("builds the table and real examples from the fixture snapshot", () => {
    const page = buildPointsPage(snapshot);
    expect(page.gameweek).toBe(3);
    expect(page.hasData).toBe(true);
    expect(page.rows[0].action).toBe("minutes");
    const goals = page.rows.find((r) => r.action === "goals_scored")!;
    expect([goals.cells[2].text, goals.cells[3].text, goals.cells[4].text]).toEqual(["+6", "+5", "+4"]);
    expect(goals.cells[3].sources).toContain("live");
    expect(page.season.matched).toBe(page.season.checked);
    expect(page.examples.length).toBeGreaterThanOrEqual(2);
    for (const ex of page.examples) {
      const sum = ex.matches.flatMap((m) => m.lines).reduce((n, l) => n + l.points, 0);
      expect(sum, ex.name).toBe(ex.total);
    }
    expect(page.examples[0].reason).toBe("Top scorer this gameweek");
  });

  it("needs a breakdown to start from", () => {
    // Season rows alone never have just one unknown part, so they can't seed the rules.
    expect(buildPointsPage({ ...snapshot, live: null }).hasData).toBe(false);
  });

  it("reads the last settled gameweek's breakdown while the current one has none", () => {
    const earlier = trimLive(2, loadRecordedGameweek(2).live, { status: [], leagues: "" });
    const empty = { ...snapshot, live: { ...snapshot.live!, elements: [] } };
    // After the deadline, before the first kickoff: nothing to learn from yet...
    expect(buildPointsPage(empty).hasData).toBe(false);
    // ...unless the snapshot kept the previous gameweek's breakdown.
    const page = buildPointsPage({ ...empty, previousLive: earlier });
    expect(page.hasData).toBe(true);
    expect(page.gameweek).toBe(2);
    expect(page.liveLines).toBeGreaterThan(0);
    const goals = page.rows.find((r) => r.action === "goals_scored")!;
    expect([goals.cells[2].text, goals.cells[3].text, goals.cells[4].text]).toEqual(["+6", "+5", "+4"]);
    // The current gameweek's own breakdown wins once it exists.
    expect(buildPointsPage({ ...snapshot, previousLive: earlier }).gameweek).toBe(3);
  });

  it("has nothing to say before the season", () => {
    const page = buildPointsPage({ ...snapshot, live: null, summaries: {} });
    expect(page.hasData).toBe(false);
    expect(page.examples).toEqual([]);
    expect(page.rows.every((r) => Object.values(r.cells).every((c) => c.rule.kind === "unseen"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { RECAP_TOOLS, createRecapSession, recapDraftSchema, toolDefinitions } from "../../src/lib/recap";
import { loadContext, loadSources, makeBlank, makeDouble } from "./helpers";
import { buildGameweekContext } from "../../src/lib/recap/context";

const TOOL_NAMES = [
  "gameweek_summary",
  "story_candidates",
  "captaincy",
  "transfer_story",
  "top_performers",
  "player_story",
  "find_players",
  "ownership_outcomes",
  "expected_vs_actual",
  "defensive_contributions",
  "team_story",
  "discipline_and_availability",
  "price_changes",
  "season_records",
  "submit_recap",
];

/** One call per data tool, with the inputs a first look at a gameweek would use. */
const TOUR: [string, unknown][] = [
  ["gameweek_summary", {}],
  ["top_performers", {}],
  ["player_story", { player: "Haaland" }],
  ["find_players", { team: "Arsenal" }],
  ["ownership_outcomes", {}],
  ["expected_vs_actual", {}],
  ["defensive_contributions", {}],
  ["team_story", { team: "Brighton" }],
  ["discipline_and_availability", {}],
  ["price_changes", {}],
  ["season_records", {}],
];

describe("tool definitions", () => {
  const definitions = toolDefinitions();

  it("list every tool with a description and a JSON Schema for its input", () => {
    expect(definitions.map((d) => d.name)).toEqual(TOOL_NAMES);
    expect(RECAP_TOOLS.map((t) => t.name)).toEqual(TOOL_NAMES);
    for (const definition of definitions) {
      expect(definition.description.length, definition.name).toBeGreaterThan(80);
      expect(definition.input_schema, definition.name).toMatchObject({ type: "object", properties: expect.any(Object) });
      expect(definition.input_schema).not.toHaveProperty("$schema");
      // Plain JSON: nothing a model API would choke on.
      expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
    }
  });

  it("describe each input, and leave defaulted inputs optional", () => {
    interface Schema {
      required?: string[];
      properties: Record<string, { description?: string; enum?: string[]; items?: Schema }>;
    }
    const byName = Object.fromEntries(definitions.map((d) => [d.name, d.input_schema as unknown as Schema]));
    expect(byName.player_story.required).toEqual(["player"]);
    expect(byName.player_story.properties.player.description).toContain("ref");
    expect(byName.top_performers.required ?? []).toEqual([]);
    expect(byName.top_performers.properties.limit).toMatchObject({ type: "integer", default: 10, minimum: 1, maximum: 20 });
    expect(byName.top_performers.properties.position.enum).toEqual(["GKP", "DEF", "MID", "FWD"]);
    expect(byName.submit_recap.required).toEqual(["headline", "paragraphs", "claims"]);
    expect(byName.submit_recap.properties.claims.items?.required).toEqual(["text", "evidence"]);
  });

  it("say what each tool can't know about a past gameweek", () => {
    const description = (name: string) => definitions.find((d) => d.name === name)!.description;
    expect(description("discipline_and_availability")).toMatch(/current gameweek/);
    expect(description("discipline_and_availability")).toMatch(/past gameweek/);
    expect(description("gameweek_summary")).toMatch(/only known for the current gameweek/);
    for (const name of ["gameweek_summary", "player_story", "ownership_outcomes", "price_changes"]) {
      expect(description(name), name).toMatch(/Gameweek 1 has no transfer/);
    }
  });
});

describe("a recap session", () => {
  it("gives every call a result id and appends it to the evidence log", () => {
    const session = createRecapSession(loadContext(3));
    const first = session.call("gameweek_summary", {});
    const second = session.call("player_story", { player: "Mitchell" });
    expect(first).toMatchObject({ id: "r1", tool: "gameweek_summary", input: {}, ok: true });
    expect(second).toMatchObject({ id: "r2", tool: "player_story", input: { player: "Mitchell" }, ok: true });
    expect(second.result).toMatchObject({ player: "Mitchell", team: "Crystal Palace", position: "DEF" });
    expect(session.evidence).toEqual([first, second]);
  });

  it("logs a failed call with a message for the agent, and keeps going", () => {
    const session = createRecapSession(loadContext(3));
    expect(session.call("league_table", {})).toMatchObject({
      id: "r1",
      ok: false,
      result: { error: expect.stringContaining('There is no tool called "league_table"') },
    });
    expect(session.call("top_performers", { limit: 500 })).toMatchObject({
      id: "r2",
      ok: false,
      result: { error: expect.stringMatching(/^Invalid input for top_performers: limit: /) },
    });
    expect(session.call("player_story", { player: "Wilson" })).toMatchObject({
      id: "r3",
      ok: false,
      result: { error: expect.stringMatching(/"Wilson" matches 2 players: .*ref p\d+.*Ask again with the ref\./) },
    });
    expect(session.call("team_story", { team: "Real Madrid" })).toMatchObject({ id: "r4", ok: false });
    expect(session.call("player_story", { player: "p204" })).toMatchObject({ id: "r5", ok: true });
    expect(session.evidence.map((e) => e.ok)).toEqual([false, false, false, false, true]);
  });

  it("returns readable, compact results: names not ids, no nulls, no timestamps", () => {
    const session = createRecapSession(loadContext(4));
    for (const [tool, input] of TOUR) {
      const entry = session.call(tool, input);
      const json = JSON.stringify(entry.result);
      expect(entry.ok, `${tool}: ${json.slice(0, 200)}`).toBe(true);
      expect(json.length, tool).toBeLessThan(5000);
      expect(json, tool).not.toContain("null");
      expect(json, tool).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(json, tool).not.toMatch(/"(?:id|playerId|teamId|fixtureId|element)":/);
      expect(JSON.parse(json), tool).toEqual(entry.result);
    }
    // Every player is a label with their club and position.
    const story = session.evidence[2].result as Record<string, unknown>;
    expect(story).toMatchObject({ player: "Haaland", ref: "p411", team: "Man City", position: "FWD" });
  });

  it("survives a double and a blank gameweek in every tool", () => {
    for (const edit of [makeDouble, makeBlank]) {
      const sources = loadSources(3);
      edit(sources, 26); // Man City v Coventry City
      const session = createRecapSession(buildGameweekContext(3, sources));
      for (const [tool, input] of TOUR) {
        expect(session.call(tool, input).ok, `${edit.name} ${tool}`).toBe(true);
      }
      expect(session.call("team_story", { team: "Man City" }).result).toMatchObject({
        note: edit === makeDouble ? expect.stringContaining("double gameweek") : expect.stringContaining("blank gameweek"),
      });
    }
  });

  it("checks a submitted recap and remembers the accepted one", () => {
    const session = createRecapSession(loadContext(3));
    session.call("gameweek_summary", {}); // r1
    session.call("player_story", { player: "Mitchell" }); // r2
    const draft = recapDraftSchema.parse({
      headline: "Mitchell's two goals top a low-scoring gameweek",
      paragraphs: [
        "Mitchell was the surprise of Gameweek 3. The Crystal Palace defender scored twice in a 3-2 win at Fulham and finished with 15 points, the best score of the week, though only 4.6% of managers owned him.",
        "Haaland, the most-captained player and owned by 73.0%, scored in Man City's 1-0 win over Coventry City and returned 9 points. Isak got both goals as Liverpool won 2-0 at Ipswich Town. The average manager scored 51 points, and 23 goals were scored across the gameweek.",
      ],
      claims: [
        { text: "Mitchell scored twice in Crystal Palace's 3-2 win at Fulham and got 15 points.", evidence: ["r2"] },
        { text: "Mitchell was owned by 4.6% of managers.", evidence: ["r2"] },
        { text: "Haaland was the most-captained player, owned by 73.0%, and got 9 points.", evidence: ["r1"] },
        { text: "Man City beat Coventry City 1-0 and Liverpool won 2-0 at Ipswich Town.", evidence: ["r1"] },
        { text: "The average manager scored 51 points and 23 goals were scored.", evidence: ["r1"] },
      ],
    });

    const wrong = structuredClone(draft);
    wrong.paragraphs[0] = wrong.paragraphs[0].replace("15 points", "18 points");
    const rejected = session.call("submit_recap", wrong);
    expect(rejected).toMatchObject({ id: "r3", tool: "submit_recap", ok: true });
    expect(rejected.result).toEqual({
      accepted: false,
      problems: [expect.stringMatching(/^paragraph 1: "18" in ".*" is not in any tool result\./)],
    });
    expect(session.accepted).toBeNull();

    const accepted = session.call("submit_recap", draft);
    expect(accepted.result).toMatchObject({ accepted: true });
    expect(session.accepted).toMatchObject({ draft, checks: { passed: true, issues: [] } });
    expect(session.evidence).toHaveLength(4);
  });

  it("rejects a malformed submission before checking it", () => {
    const session = createRecapSession(loadContext(3));
    const entry = session.call("submit_recap", { headline: "A headline", paragraphs: "one string", claims: [] });
    expect(entry).toMatchObject({ ok: false, result: { error: expect.stringContaining("paragraphs") } });
  });
});

describe("season_records", () => {
  it("does not call a tie a new season high", () => {
    // GW4's Coventry City 0-5 Brighton beats GW1's 4-0 as the biggest win so far.
    const records = (context: ReturnType<typeof loadContext>) =>
      createRecapSession(context).call("season_records", {}).result as Record<string, unknown>;
    expect(records(loadContext(4))).toMatchObject({ thisGameweekHasTheBiggestWinSoFar: true });
    const tied = loadContext(4, (s) => {
      s.fixtures.find((f) => f.team_a_score === 5)!.team_a_score = 4;
    });
    expect(records(tied)).toMatchObject({ thisGameweekHasTheBiggestWinSoFar: false });
  });
});

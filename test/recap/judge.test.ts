import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fakeJudgeModel } from "../../src/lib/recap/fakes";
import {
  JUDGE_TOOL,
  JudgeError,
  judgeRecap,
  judgeToolDefinition,
  parseReferenceStories,
  type Judgement,
  type ReferenceStories,
} from "../../src/lib/recap/judge";
import { scriptedModel } from "../../src/lib/recap/model";

const REFERENCES = path.join(__dirname, "..", "..", "evals", "references", "2026-27");

describe("reference stories", () => {
  const files = readdirSync(REFERENCES).filter((f) => /^gw\d+\.md$/.test(f));

  it.each(files)("%s parses into 3 to 5 titled stories with bodies", (file) => {
    const parsed = parseReferenceStories(readFileSync(path.join(REFERENCES, file), "utf8"));
    expect(parsed.title).toMatch(/^2026\/27 Gameweek \d+: reference stories$/);
    expect(parsed.draft).toBe(true);
    expect(parsed.stories.length).toBeGreaterThanOrEqual(3);
    expect(parsed.stories.length).toBeLessThanOrEqual(5);
    parsed.stories.forEach((story, i) => {
      expect(story.number).toBe(i + 1);
      expect(story.title).not.toMatch(/^#|^\d+[.)]\s/);
      expect(story.body.length).toBeGreaterThan(40);
    });
  });

  it("reads GW3's headings exactly", () => {
    const parsed = parseReferenceStories(readFileSync(path.join(REFERENCES, "gw03.md"), "utf8"));
    expect(parsed.stories.map((s) => s.title)).toEqual([
      "1.79 million Triple Captains on Haaland's week: 9 points",
      "Cherki is the big transfer in and scores 3",
      "Defenders top the scores: Mitchell's two goals, Bogle at 0.5% owned",
      "Highly owned players blank in a low-scoring week",
    ]);
    expect(parsed.stories[1].body).toMatch(/^- Cherki \(399\)/);
    expect(parsed.stories[1].body).not.toMatch(/Defenders top the scores/);
  });

  it("copes with the ways a person might edit a file", () => {
    const parsed = parseReferenceStories(
      [
        "# Gameweek 11 stories\r",
        "",
        "Reviewed by hand.",
        "",
        "### Story 1: **Haaland** blanks ###",
        "He scored 2.",
        "#### Sources",
        "- live #411",
        "",
        "###   2) Arsenal win 4-0",
        "```",
        "## 9. not a heading, it is in a code block",
        "```",
        "## Notes",
        "Nothing here is a story.",
        "## 3 - A third   ",
        "## 4.",
        "### __5.__ Fifth story",
      ].join("\n"),
    );
    expect(parsed.title).toBe("Gameweek 11 stories");
    expect(parsed.draft).toBe(false);
    expect(parsed.stories).toEqual([
      { number: 1, title: "Haaland blanks", body: "He scored 2.\n#### Sources\n- live #411" },
      { number: 2, title: "Arsenal win 4-0", body: "```\n## 9. not a heading, it is in a code block\n```" },
      { number: 3, title: "A third", body: "" },
      { number: 4, title: "Fifth story", body: "" },
    ]);
  });

  it("takes every heading under the title as a story when none are numbered", () => {
    const parsed = parseReferenceStories("# GW2\n\n## Fernandes hat-trick\nText.\n\n## Chelsea 4-3 Brighton\nMore.\n");
    expect(parsed.stories.map((s) => [s.number, s.title, s.body])).toEqual([
      [1, "Fernandes hat-trick", "Text."],
      [2, "Chelsea 4-3 Brighton", "More."],
    ]);
    expect(parseReferenceStories("Just a paragraph.").stories).toEqual([]);
    // A title that starts with a figure is not a numbered heading.
    expect(parseReferenceStories("# GW3\n## 1.79 million Triple Captains\n## 23 goals in 10 matches\n").stories.map((s) => s.title)).toEqual([
      "1.79 million Triple Captains",
      "23 goals in 10 matches",
    ]);
  });
});

const references: ReferenceStories = {
  title: "GW3",
  draft: true,
  stories: [
    { number: 1, title: "Haaland's Triple Captain week", body: "- 9 points." },
    { number: 2, title: "Cherki scores 3", body: "- Most transferred in." },
  ],
};
const recap = { headline: "Mitchell leads the defenders", paragraphs: ["Haaland returned 9 points.", "Mitchell scored twice."] };
const judgement: Judgement = {
  coverage: [
    { story: 2, covered: "partly", reason: "Named only." },
    { story: 1, covered: "yes", reason: "Covered in the first paragraph." },
  ],
  rubric: {
    insight: { score: 2, reason: "Mostly a list." },
    storySelection: { score: 4, reason: "Leads with the right story." },
    readability: { score: 3, reason: "Clear but flat." },
  },
};

describe("the judge", () => {
  it("offers its JSON schema as a tool", () => {
    const tool = judgeToolDefinition();
    expect(tool.name).toBe(JUDGE_TOOL);
    expect(tool.input_schema).toMatchObject({ type: "object", required: ["coverage", "rubric"] });
    expect(tool.input_schema).not.toHaveProperty("$schema");
  });

  it("sends the stories, the recap and the rubric, and returns the structured judgement", async () => {
    const model = scriptedModel("claude-opus-5-5", [
      { calls: [{ name: JUDGE_TOOL, input: judgement }], usage: { inputTokens: 2000, outputTokens: 500 } },
    ]);
    const result = await judgeRecap({ model, gameweek: 3, references, recap });

    const request = model.requests[0];
    expect(request.system).toMatch(/Insight\./);
    expect(request.system).toMatch(/Picking the right stories\./);
    expect(request.system).toMatch(/Readability\./);
    expect(request.tools.map((t) => t.name)).toEqual([JUDGE_TOOL]);
    const text = (request.messages[0].content[0] as { text: string }).text;
    expect(text).toContain("Story 1: Haaland's Triple Captain week\n- 9 points.");
    expect(text).toContain("Story 2: Cherki scores 3");
    expect(text).toContain("<headline>Mitchell leads the defenders</headline>\nHaaland returned 9 points.\n\nMitchell scored twice.");

    expect(result.judgement.coverage.map((c) => c.story)).toEqual([1, 2]); // put in story order
    expect(result.coverageScore).toBe(0.75);
    expect(result.judgement.rubric.storySelection.score).toBe(4);
    expect(result).toMatchObject({ model: "claude-opus-5-5", priced: true });
    expect(result.costUsd).toBeCloseTo((2000 * 4 + 500 * 20) / 1e6, 8);
  });

  it("asks once more when the judgement is unusable, then accepts JSON in plain text", async () => {
    const model = scriptedModel("judge", [
      { calls: [{ name: JUDGE_TOOL, input: { ...judgement, coverage: judgement.coverage.slice(0, 1) } }] },
      { text: `Here it is:\n${JSON.stringify(judgement)}` },
    ]);
    const result = await judgeRecap({ model, gameweek: 3, references, recap });
    expect(result.coverageScore).toBe(0.75);
    expect(model.requests[1].messages.at(-1)).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          toolUseId: "toolu_1_1",
          content: "Give exactly one coverage entry for each of the 2 reference stories (1, 2).",
          isError: true,
        },
      ],
    });
  });

  it("gives up after two unusable replies", async () => {
    const outOfRange = { ...judgement, rubric: { ...judgement.rubric, insight: { score: 7, reason: "!" } } };
    const model = scriptedModel("judge", [{ text: "It was fine." }, { calls: [{ name: JUDGE_TOOL, input: outOfRange }] }]);
    await expect(judgeRecap({ model, gameweek: 3, references, recap })).rejects.toThrow(JudgeError);
    expect(model.requests).toHaveLength(2);
    await expect(
      judgeRecap({ model, gameweek: 3, references: { ...references, stories: [] }, recap }),
    ).rejects.toThrow(/no reference stories/);
  });

  it("has a scripted stand-in that matches names", async () => {
    const result = await judgeRecap({ model: fakeJudgeModel(), gameweek: 3, references, recap });
    expect(result.judgement.coverage.map((c) => c.covered)).toEqual(["yes", "no"]);
    expect(result.judgement.rubric.readability.score).toBe(3);
    expect(result.priced).toBe(false);
  });
});

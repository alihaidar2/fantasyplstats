import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fakeJudgeModel, fakeWriterModel } from "../../src/lib/recap/fakes";
import { scriptedModel } from "../../src/lib/recap/model";
import { recapSchema } from "../../src/lib/recap/recap";
import { formatSummary, resultsFolderName, runEval, type EvalReport } from "../../scripts/recap-eval";

// The eval harness with scripted models (what `npm run recap:eval -- --fake`
// runs): no network, and the report goes to a temporary folder.

const resultsDir = mkdtempSync(path.join(tmpdir(), "recap-eval-"));
afterAll(() => rmSync(resultsDir, { recursive: true, force: true }));

describe("the recap eval harness", () => {
  it("runs two recorded gameweeks in fake mode and writes a report", async () => {
    const log: string[] = [];
    const { report, summary, dir } = await runEval({
      writer: fakeWriterModel(),
      judge: fakeJudgeModel(),
      gameweeks: [3, 5],
      resultsDir,
      log: (line) => log.push(line),
    });

    expect(path.dirname(dir)).toBe(resultsDir);
    expect(path.basename(dir)).toMatch(/^\d{8}T\d{6}Z-fake-writer$/);
    expect(readdirSync(dir).sort()).toEqual(["recaps", "report.json", "summary.md"]);
    expect(readdirSync(path.join(dir, "recaps")).sort()).toEqual(["gw03.json", "gw05.json"]);
    expect(JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8"))).toEqual(report);
    expect(readFileSync(path.join(dir, "summary.md"), "utf8")).toBe(summary);

    expect(report).toMatchObject({ model: "fake-writer", judgeModel: "fake-judge" });
    expect(report.gameweeks.map((g) => g.gameweek)).toEqual([3, 5]);
    for (const result of report.gameweeks) {
      expect(result).toMatchObject({
        outcome: "first-try",
        checkerPassed: true,
        failedSubmissions: [],
        toolCalls: 3,
        modelCalls: 2,
        inputTokens: 2000,
        outputTokens: 400,
        costUsd: 0,
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.judge).toMatchObject({
        referenceStories: 4,
        referencesAreDrafts: true,
        rubric: { insight: { score: 3 }, storySelection: { score: 3 }, readability: { score: 3 } },
      });
      expect(result.judge!.coverage).toHaveLength(4);
      expect(result.judge!.coverage[0].title.length).toBeGreaterThan(10);
    }
    // GW5's first reference story is Man City 5-3 Sunderland; the template lists that result.
    expect(report.gameweeks[1].headline).toBe("Brobbey tops Gameweek 5 with 17 points");
    expect(report.gameweeks[1].judge!.coverage[0]).toMatchObject({ story: 1, covered: "yes" });

    expect(report.totals).toMatchObject({
      gameweeks: 2,
      errors: 0,
      firstTry: 2,
      afterRetry: 0,
      fallback: 0,
      checkerPassed: 2,
      rubric: { insight: 3, storySelection: 3, readability: 3 },
      toolCalls: 6,
      inputTokens: 4000,
      outputTokens: 800,
      priced: false,
    });
    expect(report.totals.coverageScore).toBeGreaterThan(0);
    expect(report.totals.coverageScore).toBeLessThanOrEqual(1);

    // Each saved recap is a full, valid run log.
    const saved = recapSchema.parse(JSON.parse(readFileSync(path.join(dir, "recaps", "gw05.json"), "utf8")));
    expect(saved).toMatchObject({ gameweek: 5, model: "fake-writer", checks: { passed: true }, run: { outcome: "first-try" } });
    expect(saved.evidence).toHaveLength(3);

    expect(summary).toMatch(/^# Recap eval: fake-writer\n/);
    expect(summary).toContain("- Checker: 2 passed first try, 0 after a retry, 0 fell back to the template.");
    expect(summary).toMatch(/\| 3 \| first try \| \d of 4 \| 3 \| 3 \| 3 \| 3 \| 2,000 \/ 400 \| \$0\.0000 \| /);
    expect(summary).toContain("still drafts awaiting human review");
    expect(log.some((line) => line.startsWith("GW5: judged."))).toBe(true);
  });

  it("reports retries, fallbacks and failures per gameweek, and can skip the judge", async () => {
    // GW3: never submits, so the template is used. GW5: the model errors.
    const writer = scriptedModel("claude-haiku-5-5", (request) => {
      const kickoff = request.messages[0].content[0] as { text: string };
      if (kickoff.text.includes("Gameweek 5")) throw new Error("529 overloaded");
      return { calls: [{ name: "gameweek_summary", input: {} }], usage: { inputTokens: 1_000_000 } };
    });
    const { report, summary, dir } = await runEval({
      writer,
      judge: null,
      gameweeks: [3, 5],
      limits: { maxToolCallsPerAttempt: 1 },
      resultsDir,
      now: () => new Date("2026-11-24T09:00:00Z"),
    });

    expect(path.basename(dir)).toBe("20261124T090000Z-claude-haiku-5-5");
    expect(report.gameweeks[0]).toMatchObject({
      gameweek: 3,
      outcome: "fallback",
      checkerPassed: true,
      fallbackReason: "the model did not submit a recap within its turns",
      judge: null,
      judgeNote: "The judge was switched off.",
    });
    expect(report.gameweeks[1]).toEqual({ gameweek: 5, error: "Error: 529 overloaded" });
    expect(report.totals).toMatchObject({ gameweeks: 2, errors: 1, fallback: 1, coverageScore: null, priced: true });
    // Five requests of a million input tokens at Haiku's long-prompt price.
    expect(report.totals.costUsd).toBeCloseTo(5 * 0.5, 6);
    expect(existsSync(path.join(dir, "recaps", "gw05.json"))).toBe(false);
    expect(summary).toContain("1 fell back to the template, 1 failed to run.");
    expect(summary).toContain("| 5 | error |");
    expect(summary).toContain("- GW3: template used because the model did not submit a recap within its turns.");
    expect(summary).toContain("- GW5: did not run. Error: 529 overloaded");
  });

  it("refuses a judge that is the writer, and a gameweek that isn't recorded", async () => {
    await expect(runEval({ writer: fakeWriterModel("same"), judge: fakeJudgeModel("same"), resultsDir })).rejects.toThrow(
      /judge must be a different model/,
    );
    await expect(runEval({ writer: fakeWriterModel(), judge: null, gameweeks: [3, 38], resultsDir })).rejects.toThrow(
      /Not recorded: gameweek 38/,
    );
  });

  it("notes a gameweek with no reference file", async () => {
    const { report } = await runEval({
      writer: fakeWriterModel(),
      judge: fakeJudgeModel(),
      gameweeks: [3],
      referencesDir: path.join(resultsDir, "nowhere"),
      resultsDir: path.join(resultsDir, "no-references"),
    });
    expect(report.gameweeks[0].judge).toBeNull();
    expect(report.gameweeks[0].judgeNote).toMatch(/^No reference stories at /);
    expect(report.totals.coverageScore).toBeNull();
  });

  it("lists rejected submissions and uncovered stories in the summary", () => {
    const report: EvalReport = {
      startedAt: "2026-11-24T09:00:00.000Z",
      durationMs: 1,
      model: "claude-sonnet-5-5",
      judgeModel: "claude-opus-5-5",
      limits: { maxToolCallsPerAttempt: 15, maxOutputTokens: 4000, timeoutMs: 180_000 },
      gameweeks: [
        {
          gameweek: 7,
          outcome: "after-retry",
          checkerPassed: true,
          failedSubmissions: [{ attempt: 1, issues: ["claim 2: a", "claim 3: b", "claim 4: c", "claim 5: d"] }],
          toolCalls: 9,
          inputTokens: 41_234,
          outputTokens: 1876,
          costUsd: 0.10123,
          durationMs: 38_400,
          judge: {
            referenceStories: 5,
            referencesAreDrafts: false,
            covered: 3,
            partlyCovered: 1,
            coverageScore: 0.7,
            coverage: [{ story: 5, covered: "no", reason: "Absent.", title: "Szoboszlai sold by almost a million" }],
            rubric: {
              insight: { score: 4, reason: "" },
              storySelection: { score: 3, reason: "" },
              readability: { score: 5, reason: "" },
            },
            inputTokens: 1,
            outputTokens: 1,
            costUsd: 0.02,
          },
        },
      ],
      totals: {
        gameweeks: 1, errors: 0, firstTry: 0, afterRetry: 1, fallback: 0, checkerPassed: 1, coverageScore: 0.7,
        rubric: { insight: 4, storySelection: 3, readability: 5 },
        toolCalls: 9, inputTokens: 41_234, outputTokens: 1876, costUsd: 0.10123, judgeCostUsd: 0.02, priced: true, agentDurationMs: 38_400,
      },
    };
    const summary = formatSummary(report);
    expect(summary).toContain("- Story coverage: 70% (");
    expect(summary).toContain("insight 4.0, story selection 3.0, readability 5.0");
    expect(summary).toContain("| 7 | after retry | 3 + 1 partly of 5 | 4 | 3 | 5 | 9 | 41,234 / 1,876 | $0.1012 | 38.4s |");
    expect(summary).toContain("- GW7, submission 1 rejected: claim 2: a | claim 3: b | claim 4: c (and 1 more)");
    expect(summary).toContain("- GW7, story 5 (Szoboszlai sold by almost a million): not covered. Absent.");
    expect(summary).not.toContain("drafts awaiting");
    expect(resultsFolderName(new Date("2026-01-02T03:04:05.678Z"), "org/model:v1")).toBe("20260102T030405Z-org-model-v1");
  });
});

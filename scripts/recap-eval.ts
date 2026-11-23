// The recap eval: runs the agent over recorded gameweeks and scores each
// recap (PLAN.md step 5b, items 2 and 3). scripts/eval-recaps.ts is the
// command line for it; the tests call runEval directly with scripted models.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_AGENT_LIMITS, runRecapAgent, type AgentLimits } from "../src/lib/recap/agent";
import {
  RUBRIC_KEYS,
  judgeRecap,
  parseReferenceStories,
  type Judgement,
  type RubricKey,
} from "../src/lib/recap/judge";
import type { RecapModel } from "../src/lib/recap/model";
import { roundUsd } from "../src/lib/recap/pricing";
import type { Recap, RecapRun } from "../src/lib/recap/recap";
import { loadRecording, type Recording } from "./recorded-gameweeks";

export const DEFAULT_REFERENCES_DIR = path.join(__dirname, "..", "evals", "references");
export const DEFAULT_RESULTS_DIR = path.join(__dirname, "..", "evals", "results");

export interface EvalOptions {
  writer: RecapModel;
  /** Null skips the judge: checker results, tool calls, tokens, cost and time only. */
  judge: RecapModel | null;
  /** Default: every recorded gameweek. */
  gameweeks?: readonly number[];
  limits?: Partial<AgentLimits>;
  recording?: Recording;
  referencesDir?: string;
  /** The report goes in a new `<timestamp>-<model>` folder under this one. */
  resultsDir?: string;
  now?: () => Date;
  /** Progress lines. Default: none. */
  log?: (line: string) => void;
}

export interface GameweekEval {
  gameweek: number;
  /** Set when the run threw (a model error); the other fields are then absent. */
  error?: string;
  outcome?: RecapRun["outcome"];
  checkerPassed?: boolean;
  fallbackReason?: string;
  /** The checker's complaints about each failed submission. */
  failedSubmissions?: { attempt: number; issues: string[] }[];
  headline?: string;
  words?: number;
  toolCalls?: number;
  modelCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationMs?: number;
  /** Null when the gameweek was not judged; `judgeNote` says why. */
  judge?: {
    referenceStories: number;
    referencesAreDrafts: boolean;
    covered: number;
    partlyCovered: number;
    coverageScore: number;
    coverage: (Judgement["coverage"][number] & { title: string })[];
    rubric: Judgement["rubric"];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  judgeNote?: string;
}

export interface EvalReport {
  startedAt: string;
  durationMs: number;
  model: string;
  judgeModel: string | null;
  limits: AgentLimits;
  gameweeks: GameweekEval[];
  totals: {
    gameweeks: number;
    errors: number;
    firstTry: number;
    afterRetry: number;
    fallback: number;
    /** Recaps whose final text passed the checker, the template included. */
    checkerPassed: number;
    /** Means over the gameweeks that were judged; null when none were. */
    coverageScore: number | null;
    rubric: Record<RubricKey, number | null>;
    toolCalls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    judgeCostUsd: number;
    /** False when a model had no entry in the price table, so its cost counts as 0. */
    priced: boolean;
    agentDurationMs: number;
  };
}

export interface EvalRun {
  report: EvalReport;
  summary: string;
  /** Where report.json, summary.md and recaps/ were written. */
  dir: string;
}

const gw = (n: number) => `gw${String(n).padStart(2, "0")}`;
const message = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** "20261123T031500Z-claude-haiku-5-5" */
export function resultsFolderName(startedAt: Date, model: string): string {
  const stamp = startedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${stamp}-${model.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
}

export async function runEval(options: EvalOptions): Promise<EvalRun> {
  const { writer, judge } = options;
  if (judge && judge.id === writer.id) {
    throw new Error(`The judge must be a different model from the writer (both are ${writer.id}).`);
  }
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => {});
  const recording = options.recording ?? loadRecording();
  const referencesDir = options.referencesDir ?? DEFAULT_REFERENCES_DIR;
  const limits: AgentLimits = { ...DEFAULT_AGENT_LIMITS, ...options.limits };
  const gameweeks = [...(options.gameweeks ?? recording.gameweeks)];
  const missing = gameweeks.filter((n) => !recording.gameweeks.includes(n));
  if (missing.length) {
    throw new Error(`Not recorded: gameweek ${missing.join(", ")}. Recorded: ${recording.gameweeks.join(", ")}.`);
  }

  const startedAt = now();
  const dir = path.join(options.resultsDir ?? DEFAULT_RESULTS_DIR, resultsFolderName(startedAt, writer.id));
  mkdirSync(path.join(dir, "recaps"), { recursive: true });

  const results: GameweekEval[] = [];
  let priced = true;
  for (const gameweek of gameweeks) {
    log(`GW${gameweek}: writing with ${writer.id}...`);
    let recap: Recap;
    try {
      const context = recording.context(gameweek);
      recap = await runRecapAgent({ context, model: writer, limits, now });
    } catch (error) {
      log(`GW${gameweek}: failed. ${message(error)}`);
      results.push({ gameweek, error: message(error) });
      continue;
    }
    // The full run log (evidence, checks, attempts, usage) sits next to the report.
    writeFileSync(path.join(dir, "recaps", `${gw(gameweek)}.json`), `${JSON.stringify(recap, null, 2)}\n`);
    const run = recap.run!;
    if (!run.priced) priced = false;
    const result: GameweekEval = {
      gameweek,
      outcome: run.outcome,
      checkerPassed: recap.checks.passed,
      ...(run.fallbackReason ? { fallbackReason: run.fallbackReason } : {}),
      failedSubmissions: run.attempts
        .filter((a) => a.outcome === "failed")
        .map((a) => ({ attempt: a.attempt, issues: a.issues.map((i) => `${i.where}: ${i.message}`) })),
      headline: recap.headline,
      words: recap.paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
      toolCalls: recap.usage.toolCalls,
      modelCalls: run.modelCalls,
      inputTokens: recap.usage.inputTokens,
      outputTokens: recap.usage.outputTokens,
      costUsd: recap.costUsd,
      durationMs: recap.timing.durationMs,
      judge: null,
    };
    results.push(result);
    log(`GW${gameweek}: ${run.outcome}, ${recap.usage.toolCalls} tool calls, ${(recap.timing.durationMs / 1000).toFixed(1)}s.`);

    if (!judge) {
      result.judgeNote = "The judge was switched off.";
      continue;
    }
    const referenceFile = path.join(referencesDir, recap.season, `${gw(gameweek)}.md`);
    if (!existsSync(referenceFile)) {
      result.judgeNote = `No reference stories at ${path.relative(process.cwd(), referenceFile)}.`;
      continue;
    }
    const references = parseReferenceStories(readFileSync(referenceFile, "utf8"));
    if (references.stories.length === 0) {
      result.judgeNote = `No story headings found in ${path.relative(process.cwd(), referenceFile)}.`;
      continue;
    }
    try {
      const judged = await judgeRecap({ model: judge, gameweek, references, recap });
      if (!judged.priced) priced = false;
      const { coverage, rubric } = judged.judgement;
      result.judge = {
        referenceStories: references.stories.length,
        referencesAreDrafts: references.draft,
        covered: coverage.filter((c) => c.covered === "yes").length,
        partlyCovered: coverage.filter((c) => c.covered === "partly").length,
        coverageScore: judged.coverageScore,
        coverage: coverage.map((c) => ({ ...c, title: references.stories[c.story - 1].title })),
        rubric,
        inputTokens: judged.usage.inputTokens + judged.usage.cacheReadInputTokens + judged.usage.cacheCreationInputTokens,
        outputTokens: judged.usage.outputTokens,
        costUsd: judged.costUsd,
      };
      log(`GW${gameweek}: judged. ${result.judge.covered}/${references.stories.length} stories covered.`);
    } catch (error) {
      result.judgeNote = `The judge failed. ${message(error)}`;
      log(`GW${gameweek}: ${result.judgeNote}`);
    }
  }

  const ran = results.filter((r) => r.error === undefined);
  const judged = ran.flatMap((r) => (r.judge ? [r.judge] : []));
  const sum = (pick: (r: GameweekEval) => number | undefined) => ran.reduce((total, r) => total + (pick(r) ?? 0), 0);
  const report: EvalReport = {
    startedAt: startedAt.toISOString(),
    durationMs: Math.max(0, now().getTime() - startedAt.getTime()),
    model: writer.id,
    judgeModel: judge?.id ?? null,
    limits,
    gameweeks: results,
    totals: {
      gameweeks: results.length,
      errors: results.length - ran.length,
      firstTry: ran.filter((r) => r.outcome === "first-try").length,
      afterRetry: ran.filter((r) => r.outcome === "after-retry").length,
      fallback: ran.filter((r) => r.outcome === "fallback").length,
      checkerPassed: ran.filter((r) => r.checkerPassed).length,
      coverageScore: mean(judged.map((j) => j.coverageScore)),
      rubric: Object.fromEntries(RUBRIC_KEYS.map((key) => [key, mean(judged.map((j) => j.rubric[key].score))])) as Record<
        RubricKey,
        number | null
      >,
      toolCalls: sum((r) => r.toolCalls),
      inputTokens: sum((r) => r.inputTokens),
      outputTokens: sum((r) => r.outputTokens),
      costUsd: roundUsd(sum((r) => r.costUsd)),
      judgeCostUsd: roundUsd(judged.reduce((total, j) => total + j.costUsd, 0)),
      priced,
      agentDurationMs: sum((r) => r.durationMs),
    },
  };

  const summary = formatSummary(report);
  writeFileSync(path.join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(dir, "summary.md"), summary);
  return { report, summary, dir };
}

const usd = (n: number) => `$${n.toFixed(4)}`;
const score = (n: number | null) => (n === null ? "n/a" : n.toFixed(1));
const percent = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);
const OUTCOME: Record<RecapRun["outcome"], string> = {
  "first-try": "first try",
  "after-retry": "after retry",
  fallback: "fallback",
};

/** The short markdown summary of a report. */
export function formatSummary(report: EvalReport): string {
  const t = report.totals;
  const lines: string[] = [
    `# Recap eval: ${report.model}`,
    "",
    `Run ${report.startedAt}. Judge: ${report.judgeModel ?? "none"}. ${t.gameweeks} gameweek(s). ` +
      `Limits: ${report.limits.maxToolCallsPerAttempt} tool calls per attempt, ${report.limits.maxOutputTokens} output tokens per reply, ` +
      `${Math.round(report.limits.timeoutMs / 1000)}s per recap.`,
    "",
    `- Checker: ${t.firstTry} passed first try, ${t.afterRetry} after a retry, ${t.fallback} fell back to the template` +
      (t.errors ? `, ${t.errors} failed to run` : "") +
      ".",
    `- Story coverage: ${percent(t.coverageScore)} (a story covered counts 1, partly covered a half).`,
    `- Quality (1–5): insight ${score(t.rubric.insight)}, story selection ${score(t.rubric.storySelection)}, readability ${score(t.rubric.readability)}.`,
    `- Writer: ${t.toolCalls} tool calls, ${t.inputTokens.toLocaleString("en-GB")} input and ${t.outputTokens.toLocaleString("en-GB")} output tokens, ` +
      `${usd(t.costUsd)}, ${(t.agentDurationMs / 1000).toFixed(1)}s. Judge: ${usd(t.judgeCostUsd)}.` +
      (t.priced ? "" : " A model has no entry in the price table, so its cost is counted as 0."),
    "",
    "| GW | Checker | Stories covered | Insight | Stories | Readability | Tool calls | Tokens in / out | Cost | Time |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of report.gameweeks) {
    if (r.error !== undefined) {
      lines.push(`| ${r.gameweek} | error | | | | | | | | |`);
      continue;
    }
    const j = r.judge;
    const covered = j ? `${j.covered}${j.partlyCovered ? ` + ${j.partlyCovered} partly` : ""} of ${j.referenceStories}` : "n/a";
    lines.push(
      `| ${r.gameweek} | ${OUTCOME[r.outcome!]}${r.checkerPassed ? "" : " (FAILED)"} | ${covered} | ` +
        `${j ? j.rubric.insight.score : "n/a"} | ${j ? j.rubric.storySelection.score : "n/a"} | ${j ? j.rubric.readability.score : "n/a"} | ` +
        `${r.toolCalls} | ${r.inputTokens!.toLocaleString("en-GB")} / ${r.outputTokens!.toLocaleString("en-GB")} | ${usd(r.costUsd!)} | ${(r.durationMs! / 1000).toFixed(1)}s |`,
    );
  }

  const notes: string[] = [];
  for (const r of report.gameweeks) {
    if (r.error !== undefined) notes.push(`- GW${r.gameweek}: did not run. ${r.error}`);
    if (r.fallbackReason) notes.push(`- GW${r.gameweek}: template used because ${r.fallbackReason}.`);
    for (const failed of r.failedSubmissions ?? []) {
      const shown = failed.issues.slice(0, 3).join(" | ");
      const more = failed.issues.length > 3 ? ` (and ${failed.issues.length - 3} more)` : "";
      notes.push(`- GW${r.gameweek}, submission ${failed.attempt} rejected: ${shown}${more}`);
    }
    if (r.judgeNote && report.judgeModel) notes.push(`- GW${r.gameweek}: not judged. ${r.judgeNote}`);
    for (const c of r.judge?.coverage ?? []) {
      if (c.covered !== "yes") notes.push(`- GW${r.gameweek}, story ${c.story} (${c.title}): ${c.covered === "no" ? "not covered" : "partly covered"}. ${c.reason}`);
    }
  }
  if (report.gameweeks.some((r) => r.judge?.referencesAreDrafts)) {
    notes.push("- Some reference stories are still drafts awaiting human review, so coverage is provisional.");
  }
  if (notes.length) lines.push("", "## Notes", "", ...notes);
  lines.push("", "The saved recaps, with their evidence logs and check reports, are in `recaps/`; `report.json` has the judge's reasons.", "");
  return lines.join("\n");
}

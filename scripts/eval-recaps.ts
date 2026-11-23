// Runs the recap agent over the gameweeks recorded in test/fixtures/gameweeks/
// and reports, per gameweek: whether the checker passed first try, after a
// retry or not at all (template fallback); story coverage and a quality score
// from a judge model; tool calls, tokens, cost and time.
//
//   npm run recap:eval -- --fake                       # scripted models, no network
//   npm run recap:eval -- --model claude-haiku-5-5     # every recorded gameweek
//   npm run recap:eval -- --model claude-sonnet-5-5 --gameweeks 3,5
//
// Options:
//   --model <id>            the writer (default claude-haiku-5-5)
//   --judge-model <id>      the judge (default claude-opus-5-5); must differ from the writer
//   --gameweeks 3,5         which recorded gameweeks (default all)
//   --fake                  scripted writer and judge: checks the plumbing, calls nothing
//   --no-judge              skip coverage and quality scoring
//   --max-tool-calls <n>    per attempt (default 15)
//   --max-output-tokens <n> per model reply (default 4000)
//   --timeout-ms <n>        per recap (default 180000)
//   --out <dir>             where the results folder goes (default evals/results/, gitignored)
//
// Credentials for a real run are whatever the Anthropic SDK resolves by
// default: ANTHROPIC_API_KEY, `ant auth login`, or Workload Identity
// Federation variables. See src/lib/recap/anthropic-model.ts.

import path from "node:path";
import { parseArgs } from "node:util";
import type { AgentLimits } from "../src/lib/recap/agent";
import { anthropicModel } from "../src/lib/recap/anthropic-model";
import { fakeJudgeModel, fakeWriterModel } from "../src/lib/recap/fakes";
import type { RecapModel } from "../src/lib/recap/model";
import { DEFAULT_RESULTS_DIR, runEval } from "./recap-eval";

const { values } = parseArgs({
  options: {
    model: { type: "string", default: "claude-haiku-5-5" },
    "judge-model": { type: "string", default: "claude-opus-5-5" },
    gameweeks: { type: "string" },
    fake: { type: "boolean", default: false },
    "no-judge": { type: "boolean", default: false },
    "max-tool-calls": { type: "string" },
    "max-output-tokens": { type: "string" },
    "timeout-ms": { type: "string" },
    out: { type: "string", default: DEFAULT_RESULTS_DIR },
  },
});

function positiveInt(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive whole number, not "${value}".`);
  return n;
}

async function main(): Promise<number> {
  const gameweeks = values.gameweeks
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => positiveInt("gameweeks", part)!);

  const limits: Partial<AgentLimits> = {};
  const maxToolCalls = positiveInt("max-tool-calls", values["max-tool-calls"]);
  const maxOutputTokens = positiveInt("max-output-tokens", values["max-output-tokens"]);
  const timeoutMs = positiveInt("timeout-ms", values["timeout-ms"]);
  if (maxToolCalls !== undefined) limits.maxToolCallsPerAttempt = maxToolCalls;
  if (maxOutputTokens !== undefined) limits.maxOutputTokens = maxOutputTokens;
  if (timeoutMs !== undefined) limits.timeoutMs = timeoutMs;

  let writer: RecapModel;
  let judge: RecapModel | null;
  if (values.fake) {
    writer = fakeWriterModel();
    judge = values["no-judge"] ? null : fakeJudgeModel();
  } else {
    if (!values["no-judge"] && values.model === values["judge-model"]) {
      throw new Error(`--judge-model must differ from --model (both are ${values.model}).`);
    }
    writer = anthropicModel(values.model!);
    judge = values["no-judge"] ? null : anthropicModel(values["judge-model"]!);
  }

  const { report, summary, dir } = await runEval({
    writer,
    judge,
    gameweeks,
    limits,
    resultsDir: path.resolve(values.out!),
    log: (line) => console.error(line),
  });
  console.log(summary);
  console.log(`Report: ${path.relative(process.cwd(), dir)}/`);
  return report.totals.errors > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);

// Writes the AI recap of the latest settled gameweek to
// content/recaps/<season>/gw<NN>.json (PLAN.md step 5b, item 4). The recap
// workflow (.github/workflows/recap.yml) runs it and opens a PR with the file.
//
//   npm run recap:publish                                # latest settled gameweek, if it has no recap yet
//   npm run recap:publish -- --gameweek 11 --dry-run     # write nothing, print the recap
//   npm run recap:publish -- --select-only               # just say which gameweek is due
//   npm run recap:publish -- --fake --recorded --dry-run # offline plumbing check: recorded data, scripted model
//
// Options:
//   --gameweek <n>      recap this gameweek (must be settled and not yet published)
//   --model <id>        the writer (default claude-opus-5-5)
//   --dry-run           print the recap and write nothing
//   --select-only       choose the gameweek and stop (two FPL requests, no model)
//   --snapshot <file>   use this snapshot (from `npm run fetch`) instead of fetching a fresh one
//   --content-dir <dir> where published recaps live (default content/recaps)
//   --pr-body <file>    also write the pull request description here
//   --fake              scripted writer: calls no model (needs --dry-run or another --content-dir)
//   --recorded          read test/fixtures/gameweeks/ instead of FPL (same rule as --fake)
//
// Exit codes: 0 when a recap was written (or would be, on a dry run) or there
// is nothing to do; 1 when the checker rejected the model's recap (the
// template fallback is never published), the gameweek asked for isn't
// settled or already has a recap, or anything failed.
//
// Under GitHub Actions it also sets the step outputs `status` (published,
// selected or nothing-to-do), `season`, `gameweek` and `file`.
//
// Credentials for the model are whatever the Anthropic SDK resolves; the
// workflow uses Workload Identity Federation. See src/lib/recap/anthropic-model.ts.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { parseSnapshot } from "../src/lib/fpl";
import { anthropicModel } from "../src/lib/recap/anthropic-model";
import { fakeWriterModel } from "../src/lib/recap/fakes";
import type { RecapModel } from "../src/lib/recap/model";
import { DEFAULT_RECAP_DIR } from "../src/lib/recaps";
import { loadRecording } from "./recorded-gameweeks";
import {
  PublishError,
  liveSource,
  publishRecap,
  recapPullRequestBody,
  recapStats,
  recapText,
  recordedSource,
} from "./recap-publisher";

const { values } = parseArgs({
  options: {
    gameweek: { type: "string" },
    model: { type: "string", default: "claude-opus-5-5" },
    "dry-run": { type: "boolean", default: false },
    "select-only": { type: "boolean", default: false },
    snapshot: { type: "string" },
    "content-dir": { type: "string", default: DEFAULT_RECAP_DIR },
    "pr-body": { type: "string" },
    fake: { type: "boolean", default: false },
    recorded: { type: "boolean", default: false },
  },
});

function setOutputs(outputs: Record<string, string | number>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(file, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(""));
}

async function main(): Promise<number> {
  let gameweek: number | undefined;
  if (values.gameweek !== undefined && values.gameweek.trim() !== "") {
    gameweek = Number(values.gameweek);
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
      throw new PublishError(`--gameweek must be a whole number from 1 to 38, not "${values.gameweek}".`);
    }
  }
  const contentDir = path.resolve(values["content-dir"]!);
  const writesToSite = contentDir === path.resolve(DEFAULT_RECAP_DIR) && !values["dry-run"];
  if ((values.fake || values.recorded) && writesToSite && !values["select-only"]) {
    throw new PublishError(
      `--fake and --recorded never write to ${DEFAULT_RECAP_DIR}/ (everything there is published): add --dry-run or --content-dir.`,
    );
  }

  const log = (line: string) => console.error(line);
  const source = values.recorded
    ? recordedSource(loadRecording())
    : liveSource({
        snapshot: values.snapshot ? parseSnapshot(JSON.parse(readFileSync(values.snapshot, "utf8"))) : undefined,
        log,
      });
  // One client for the whole run: with Workload Identity Federation a second
  // client would exchange the same GitHub token again, which is refused.
  // Not created at all for --select-only, which needs no credentials.
  const model: RecapModel | null = values["select-only"]
    ? null
    : values.fake
      ? fakeWriterModel()
      : anthropicModel(values.model!, new Anthropic());

  const result = await publishRecap({
    source,
    model,
    contentDir,
    gameweek,
    selectOnly: values["select-only"],
    dryRun: values["dry-run"],
    log,
  });

  if (result.status === "nothing-to-do") {
    console.log(`Nothing to publish: ${result.reason}.`);
    setOutputs({ status: result.status, season: result.season });
    return 0;
  }
  const rel = path.relative(process.cwd(), result.file);
  setOutputs({ status: result.status, season: result.season, gameweek: result.gameweek, file: rel });
  if (result.status === "selected") {
    console.log(`Gameweek ${result.gameweek} of ${result.season} is settled and has no recap: it would go to ${rel}.`);
    return 0;
  }

  const { recap } = result;
  console.log(`${recapText(recap)}\n\n${recapStats(recap)}`);
  console.log(result.written ? `\nWrote ${rel}` : `\nDry run: nothing written (it would go to ${rel}).`);
  if (values["pr-body"]) writeFileSync(values["pr-body"], `${recapPullRequestBody(recap, rel)}\n`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof PublishError ? error.message : error instanceof Error ? `${error.name}: ${error.message}` : error);
    process.exitCode = 1;
  },
);

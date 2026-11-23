// Fetch FPL data, validate it and write the snapshot the build reads.
//
//   npm run fetch               # incremental on match days, full otherwise
//   npm run fetch -- --full     # refetch every element-summary and team of the week
//
// Options: --out <file> (default .data/snapshot.json). The previous snapshot
// is read from the same file. FPL_BASE_URL overrides the API root.
// Exits non-zero on any failure and leaves the previous snapshot untouched.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  DEFAULT_FPL_BASE_URL,
  DEFAULT_SNAPSHOT_FILE,
  buildSnapshot,
  createFplClient,
  parsePreviousSnapshot,
  snapshotSizes,
  type Snapshot,
} from "../src/lib/fpl";

/** The previous snapshot, or null (missing, unreadable, or an older version), which means a full refetch. */
function readPrevious(file: string): Snapshot | null {
  if (!existsSync(file)) return null;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(`Ignoring the previous snapshot at ${file}: ${(error as Error).message}`);
    return null;
  }
  return parsePreviousSnapshot(json, (message) => console.warn(`${message} (${file})`));
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string", default: DEFAULT_SNAPSHOT_FILE },
      full: { type: "boolean", default: false },
    },
  });
  const out = resolve(values.out!);
  const baseUrl = process.env.FPL_BASE_URL || DEFAULT_FPL_BASE_URL;
  const started = Date.now();

  const { snapshot, plan, dreamTeamPlan } = await buildSnapshot({
    client: createFplClient({ baseUrl }),
    previous: readPrevious(out),
    forceFull: values.full,
    log: (message) => console.log(message),
  });

  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot));
  renameSync(tmp, out);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const sizes = snapshotSizes(snapshot);
  const summary =
    `Snapshot ${snapshot.generatedAt}: ${plan.mode} refresh (${plan.reason}). ` +
    `Fetched ${plan.refetch.length} element summaries, reused ${plan.reuse.length}; ` +
    `fetched ${dreamTeamPlan.fetch.length} teams of the week, reused ${dreamTeamPlan.reuse.length}; ` +
    `live data for ${snapshot.live ? `GW${snapshot.live.gameweek}` : "no gameweek"}; in ${seconds}s. ` +
    `Size ${kb(sizes.total)} (${Object.entries(sizes)
      .filter(([part]) => part !== "total")
      .map(([part, bytes]) => `${part} ${kb(bytes)}`)
      .join(", ")}).`;
  console.log(`${summary}\nWrote ${out}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### FPL data\n\n${summary}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

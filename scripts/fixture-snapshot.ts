// Build a snapshot from the recorded FPL responses in test/fixtures/, with no
// network. The CI workflow (ci.yml) builds from it so its PR checks never call
// the live FPL API; Azure PR previews still use `npm run fetch`. It runs
// through the same buildSnapshot/parseSnapshot validation as `npm run fetch`.
// GW3 is current: it has per-match stats for gameweeks 1–6, teams of the week
// for GW1–2 and GW3's live data (see test/fixture-client.ts).
//
//   npm run fetch:fixtures
//
// Options: --out <file> (default .data/snapshot.json, which it overwrites).

import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_SNAPSHOT_FILE, snapshotSizes } from "../src/lib/fpl";
import { buildFixtureSnapshot } from "../test/fixture-client";

async function main() {
  const { values } = parseArgs({
    options: { out: { type: "string", default: DEFAULT_SNAPSHOT_FILE } },
  });
  const out = resolve(values.out!);

  const { snapshot } = await buildFixtureSnapshot();

  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot));
  renameSync(tmp, out);

  const summary =
    `Fixture snapshot ${snapshot.generatedAt} from test/fixtures/ (no FPL requests): ` +
    `${snapshot.bootstrap.elements.length} players, ${snapshot.fixtures.length} fixtures ` +
    `(${snapshot.fixtures.filter((f) => f.stats.some((s) => s.h.length || s.a.length)).length} with match stats), ` +
    `teams of the week for GW${Object.keys(snapshot.dreamTeams).join(", GW")}, ` +
    `live data for ${snapshot.live ? `GW${snapshot.live.gameweek}` : "no gameweek"}; ` +
    `${(snapshotSizes(snapshot).total / 1024).toFixed(0)} KB.`;
  console.log(`${summary}\nWrote ${out}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### FPL data\n\n${summary}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

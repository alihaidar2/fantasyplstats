// Decide whether this workflow run should fetch, build and deploy.
// Scheduled runs are gated by match days (see SCHEDULES); every other trigger
// runs. Reads the previous snapshot (restored from the Actions cache) for the
// fixture list, so the decision itself makes no FPL requests.
//
// Env: EVENT_NAME (github.event_name), SCHEDULE (github.event.schedule),
// GITHUB_OUTPUT (receives run=true|false). Options: --snapshot <file>.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  DEFAULT_SNAPSHOT_FILE,
  fixtureSchema,
  planScheduledRun,
  type RunDecision,
  type ScheduleFixture,
} from "../src/lib/fpl";

// Only the fields the schedule needs, so a previous snapshot of an older
// version (such as one cached before a SNAPSHOT_VERSION bump) still counts.
const scheduleFixtures = z.array(fixtureSchema.pick({ kickoff_time: true, team_h: true, team_a: true }));

function readFixtures(file: string): ScheduleFixture[] | null {
  if (!existsSync(file)) return null;
  try {
    const json = JSON.parse(readFileSync(file, "utf8"));
    return z.object({ fixtures: scheduleFixtures }).parse(json).fixtures;
  } catch {
    return null;
  }
}

const { values } = parseArgs({
  options: { snapshot: { type: "string", default: DEFAULT_SNAPSHOT_FILE } },
});
const event = process.env.EVENT_NAME ?? "manual";
const decision: RunDecision =
  event === "schedule"
    ? planScheduledRun(process.env.SCHEDULE ?? "", new Date(), readFixtures(values.snapshot!))
    : { run: true, reason: `triggered by ${event}` };

console.log(`${decision.run ? "Running" : "Skipping"}: ${decision.reason}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY && !decision.run) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Skipped: ${decision.reason}\n`);
}

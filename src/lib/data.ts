// Build-time access to the FPL snapshot for pages. Server-only: it reads the
// file system, so importing it from a client component fails the build.

import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SNAPSHOT_FILE, parseSnapshot, type Snapshot } from "@/lib/fpl";

let cached: Snapshot | undefined;

/** The validated snapshot written by `npm run fetch`, read once per process. */
export function getSnapshot(): Snapshot {
  if (cached) return cached;
  const file = path.join(process.cwd(), DEFAULT_SNAPSHOT_FILE);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(`No FPL snapshot at ${file}. Run \`npm run fetch\` before building.`);
  }
  cached = parseSnapshot(JSON.parse(raw));
  return cached;
}

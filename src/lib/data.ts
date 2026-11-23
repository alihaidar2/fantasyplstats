// Build-time access to the FPL snapshot and the published recaps for pages.
// Server-only: it reads the file system, so importing it from a client
// component fails the build.

import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SNAPSHOT_FILE, parseSnapshot, type Snapshot } from "@/lib/fpl";
import { loadRecaps, recapContentDir, type PublishedRecap } from "@/lib/recaps";

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

let cachedRecaps: PublishedRecap[] | undefined;

/**
 * Every published recap, newest first, read once per process from
 * content/recaps/ (or $RECAP_CONTENT_DIR). An invalid recap file throws, which
 * fails the build.
 */
export function getRecaps(): PublishedRecap[] {
  cachedRecaps ??= loadRecaps(recapContentDir());
  return cachedRecaps;
}

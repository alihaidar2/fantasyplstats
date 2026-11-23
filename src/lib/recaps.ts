// Published gameweek recaps: content/recaps/<season>/gw<NN>.json, one file per
// gameweek, each a saved recap (src/lib/recap/recap.ts) that a person approved
// in a pull request. Read and validated at build time; an invalid file fails
// the build. With no files (or no folder) the site builds without recaps.
//
// Relative imports, not `@/`, so the Vitest tests can import this file.
// Server-only: it reads the file system.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { recapSchema, type Recap } from "./recap/recap";
import { recapPath } from "./site";

/** Where published recaps live, relative to the project root. */
export const DEFAULT_RECAP_DIR = "content/recaps";

/**
 * Points the build at another recap folder. CI builds once with none and once
 * with test/fixtures/recaps/, so the recap pages are built without a fake
 * recap ever sitting in content/.
 */
export const RECAP_DIR_ENV = "RECAP_CONTENT_DIR";

/** The recap folder for this build: $RECAP_CONTENT_DIR, else content/recaps, resolved against `cwd`. */
export function recapContentDir(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = env[RECAP_DIR_ENV]?.trim();
  return path.resolve(cwd, configured || DEFAULT_RECAP_DIR);
}

/** What the site needs from a recap. The evidence log stays out, so it never reaches a page. */
export interface PublishedRecap {
  season: string;
  gameweek: number;
  /** "/recap/2026-27/gw4/" */
  path: string;
  headline: string;
  paragraphs: string[];
  /** The model that wrote it, or "hand-written". */
  model: string;
  generatedAt: string;
}

export class RecapContentError extends Error {
  constructor(problems: string[], dir: string) {
    super(
      `Invalid recap content in ${dir}:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
        "Every .json file must be <season>/gw<N>.json (e.g. 2026-27/gw04.json) and a valid saved recap " +
        "(recapSchema in src/lib/recap/recap.ts) whose checks passed.",
    );
    this.name = "RecapContentError";
  }
}

const SEASON_DIR = /^\d{4}-\d{2}$/;
const GAMEWEEK_FILE = /^gw(\d{1,2})\.json$/;

/** Every file under `dir`, as paths relative to it with "/" separators. */
function listFiles(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(dir, rel));
    else files.push(rel);
  }
  return files;
}

/** One file's problems, or the recap it holds. */
function readRecapFile(dir: string, rel: string): { recap: Recap } | { problems: string[] } {
  const parts = rel.split("/");
  const fileMatch = parts.length === 2 ? GAMEWEEK_FILE.exec(parts[1]) : null;
  if (!fileMatch || !SEASON_DIR.test(parts[0])) {
    return { problems: [`${rel}: expected <season>/gw<N>.json, e.g. 2026-27/gw04.json`] };
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path.join(dir, rel), "utf8"));
  } catch (error) {
    return { problems: [`${rel}: not valid JSON (${error instanceof Error ? error.message : error})`] };
  }

  const parsed = recapSchema.safeParse(json);
  if (!parsed.success) {
    const details = z.prettifyError(parsed.error).split("\n").join("\n      ");
    return { problems: [`${rel}: does not match the recap schema:\n      ${details}`] };
  }

  const recap = parsed.data;
  const problems: string[] = [];
  const [season] = parts;
  const gameweek = Number(fileMatch[1]);
  if (recap.season !== season) problems.push(`${rel}: its season is ${recap.season}, but it is in the ${season} folder`);
  if (recap.gameweek !== gameweek) problems.push(`${rel}: it is a recap of gameweek ${recap.gameweek}, not ${gameweek}`);
  if (!recap.checks.passed) {
    problems.push(`${rel}: its checks did not pass (${recap.checks.issues.length} issues), so it can't be published`);
  }
  return problems.length ? { problems } : { recap };
}

/** Newest first: by season, then gameweek. */
export function compareNewestFirst(
  a: Pick<PublishedRecap, "season" | "gameweek">,
  b: Pick<PublishedRecap, "season" | "gameweek">,
): number {
  return b.season.localeCompare(a.season) || b.gameweek - a.gameweek;
}

export function toPublishedRecap(recap: Recap): PublishedRecap {
  return {
    season: recap.season,
    gameweek: recap.gameweek,
    path: recapPath(recap.season, recap.gameweek),
    headline: recap.headline,
    paragraphs: recap.paragraphs,
    model: recap.model,
    generatedAt: recap.generatedAt,
  };
}

/**
 * Reads and validates every recap under `dir`, newest first. A missing or
 * empty folder means no recaps. Throws a RecapContentError listing every
 * problem if any file is misplaced, invalid, failed its checks, or duplicates
 * another gameweek. Files that aren't .json (a README, .gitkeep) are ignored.
 */
export function loadRecaps(dir: string): PublishedRecap[] {
  if (!existsSync(dir)) return [];
  if (!statSync(dir).isDirectory()) throw new RecapContentError(["it is not a folder"], dir);

  const problems: string[] = [];
  const recaps: PublishedRecap[] = [];
  const seen = new Map<string, string>();

  for (const rel of listFiles(dir).filter((f) => f.endsWith(".json")).sort()) {
    const result = readRecapFile(dir, rel);
    if ("problems" in result) {
      problems.push(...result.problems);
      continue;
    }
    const key = `${result.recap.season}/${result.recap.gameweek}`;
    const other = seen.get(key);
    if (other) {
      problems.push(`${rel}: gameweek ${result.recap.gameweek} of ${result.recap.season} already has a recap (${other})`);
      continue;
    }
    seen.set(key, rel);
    recaps.push(toPublishedRecap(result.recap));
  }

  if (problems.length) throw new RecapContentError(problems, dir);
  return recaps.sort(compareNewestFirst);
}

/** The newest recap, or null when none is published. Expects newest-first order (as loadRecaps returns). */
export function latestRecap(recaps: readonly PublishedRecap[]): PublishedRecap | null {
  return recaps[0] ?? null;
}

export function findRecap(
  recaps: readonly PublishedRecap[],
  season: string,
  gameweek: number,
): PublishedRecap | null {
  return recaps.find((r) => r.season === season && r.gameweek === gameweek) ?? null;
}

/**
 * The recaps either side of one, across seasons: `previous` is the next older
 * recap and `next` the next newer one. Gaps (a gameweek with no recap) are
 * skipped. Expects newest-first order.
 */
export function adjacentRecaps(
  recaps: readonly PublishedRecap[],
  recap: Pick<PublishedRecap, "season" | "gameweek">,
): { previous: PublishedRecap | null; next: PublishedRecap | null } {
  const i = recaps.findIndex((r) => r.season === recap.season && r.gameweek === recap.gameweek);
  if (i === -1) return { previous: null, next: null };
  return { previous: recaps[i + 1] ?? null, next: recaps[i - 1] ?? null };
}

/** "2026-27" -> "2026/27", as FPL writes seasons. */
export function formatSeason(season: string): string {
  return season.replace("-", "/");
}

/** Route param for a recap page's gameweek: "gw4" -> 4; anything else -> null. */
export function parseGameweekParam(param: string): number | null {
  const match = /^gw([1-9]\d?)$/.exec(param);
  return match ? Number(match[1]) : null;
}

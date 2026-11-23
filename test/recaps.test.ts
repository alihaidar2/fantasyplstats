import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recapSchema, type Recap } from "../src/lib/recap/recap";
import {
  adjacentRecaps,
  compareNewestFirst,
  DEFAULT_RECAP_DIR,
  findRecap,
  formatSeason,
  latestRecap,
  loadRecaps,
  parseGameweekParam,
  RecapContentError,
  recapContentDir,
  toPublishedRecap,
  type PublishedRecap,
} from "../src/lib/recaps";
import { loadRecapRaw } from "./recap/helpers";

const FIXTURE_DIR = path.join(__dirname, "fixtures", "recaps");

/** A fresh copy of the hand-written GW4 sample, edited by `changes`. */
function sampleRecap(changes: Partial<Recap> = {}): Recap {
  return { ...(loadRecapRaw("sample-recap.json") as Recap), ...changes };
}

/** A published recap for ordering tests; only season and gameweek matter. */
const published = (season: string, gameweek: number): PublishedRecap =>
  toPublishedRecap(sampleRecap({ season, gameweek, headline: `${season} GW${gameweek}` }));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "recaps-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content: unknown) {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

/** The error loadRecaps throws for the current temp folder. */
function loadError(): RecapContentError {
  try {
    loadRecaps(dir);
  } catch (error) {
    expect(error).toBeInstanceOf(RecapContentError);
    return error as RecapContentError;
  }
  throw new Error("expected loadRecaps to throw");
}

describe("recapContentDir", () => {
  it("defaults to content/recaps under the working directory", () => {
    expect(recapContentDir({}, "/repo")).toBe(path.resolve("/repo", DEFAULT_RECAP_DIR));
    expect(recapContentDir({ RECAP_CONTENT_DIR: "  " }, "/repo")).toBe(path.resolve("/repo", DEFAULT_RECAP_DIR));
  });

  it("can be pointed elsewhere with RECAP_CONTENT_DIR, relative or absolute", () => {
    expect(recapContentDir({ RECAP_CONTENT_DIR: "test/fixtures/recaps" }, "/repo")).toBe(
      path.resolve("/repo", "test/fixtures/recaps"),
    );
    expect(recapContentDir({ RECAP_CONTENT_DIR: "/tmp/recaps" }, "/repo")).toBe(path.resolve("/tmp/recaps"));
  });
});

describe("loadRecaps", () => {
  it("returns no recaps for a missing folder", () => {
    expect(loadRecaps(path.join(dir, "missing"))).toEqual([]);
  });

  it("returns no recaps for an empty folder, ignoring files that aren't JSON", () => {
    expect(loadRecaps(dir)).toEqual([]);
    write("README.md", "# Recaps");
    write("2026-27/.gitkeep", "");
    expect(loadRecaps(dir)).toEqual([]);
  });

  it("loads the CI fixture folder: the sample GW4 recap, without its evidence log", () => {
    const recaps = loadRecaps(FIXTURE_DIR);
    const sample = sampleRecap();
    expect(recaps).toEqual([
      {
        season: "2026-27",
        gameweek: 4,
        path: "/recap/2026-27/gw4/",
        headline: sample.headline,
        paragraphs: sample.paragraphs,
        model: "hand-written",
        generatedAt: sample.generatedAt,
      },
    ]);
    expect(recaps[0]).not.toHaveProperty("evidence");
  });

  it("keeps the CI fixture an exact copy of the sample recap", () => {
    const copy = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "2026-27", "gw04.json"), "utf8"));
    expect(copy).toEqual(loadRecapRaw("sample-recap.json"));
    expect(recapSchema.safeParse(copy).success).toBe(true);
  });

  it("accepts padded and unpadded gameweek file names", () => {
    write("2026-27/gw04.json", sampleRecap());
    write("2026-27/gw5.json", sampleRecap({ gameweek: 5 }));
    write("2026-27/gw10.json", sampleRecap({ gameweek: 10 }));
    expect(loadRecaps(dir).map((r) => r.gameweek)).toEqual([10, 5, 4]);
  });

  it("fails on a file that isn't valid JSON, naming it", () => {
    write("2026-27/gw04.json", "{ not json");
    expect(loadError().message).toMatch(/2026-27\/gw04\.json: not valid JSON/);
  });

  it("fails on a recap that doesn't match the schema, with the schema's message", () => {
    const withoutHeadline: Partial<Recap> = sampleRecap();
    delete withoutHeadline.headline;
    write("2026-27/gw04.json", withoutHeadline);
    write("2026-27/gw05.json", sampleRecap({ gameweek: 5, version: 2 as 1 }));
    const message = loadError().message;
    expect(message).toMatch(/2026-27\/gw04\.json: does not match the recap schema/);
    expect(message).toMatch(/headline/);
    expect(message).toMatch(/2026-27\/gw05\.json: does not match the recap schema/);
    expect(message).toMatch(/version/);
  });

  it("fails on misplaced files", () => {
    write("gw04.json", sampleRecap());
    write("2026/gw04.json", sampleRecap());
    write("2026-27/gameweek4.json", sampleRecap());
    write("2026-27/extra/gw04.json", sampleRecap());
    const message = loadError().message;
    for (const rel of ["gw04.json", "2026/gw04.json", "2026-27/gameweek4.json", "2026-27/extra/gw04.json"]) {
      expect(message).toContain(`${rel}: expected <season>/gw<N>.json`);
    }
  });

  it("fails when the file's season or gameweek doesn't match its path", () => {
    write("2025-26/gw04.json", sampleRecap());
    write("2026-27/gw05.json", sampleRecap());
    const message = loadError().message;
    expect(message).toMatch(/2025-26\/gw04\.json: its season is 2026-27, but it is in the 2025-26 folder/);
    expect(message).toMatch(/2026-27\/gw05\.json: it is a recap of gameweek 4, not 5/);
  });

  it("refuses a recap whose checks didn't pass", () => {
    const recap = sampleRecap();
    write("2026-27/gw04.json", {
      ...recap,
      checks: { ...recap.checks, passed: false, issues: [{ code: "x", where: "claim 1", message: "wrong" }] },
    });
    expect(loadError().message).toMatch(/gw04\.json: its checks did not pass \(1 issues\)/);
  });

  it("refuses two files for the same gameweek", () => {
    write("2026-27/gw04.json", sampleRecap());
    write("2026-27/gw4.json", sampleRecap());
    expect(loadError().message).toMatch(/gameweek 4 of 2026-27 already has a recap/);
  });

  it("reports every problem at once and explains the expected format", () => {
    write("2026-27/gw04.json", "nope");
    write("2026-27/gw05.json", "nope");
    const message = loadError().message;
    expect(message).toContain(`Invalid recap content in ${dir}`);
    expect(message.match(/\.json: not valid JSON/g)).toHaveLength(2);
    expect(message).toMatch(/recapSchema in src\/lib\/recap\/recap\.ts/);
  });
});

describe("ordering", () => {
  const recaps = [published("2025-26", 38), published("2026-27", 3), published("2026-27", 12), published("2025-26", 1)];

  it("sorts newest first: by season, then gameweek (numerically)", () => {
    const sorted = [...recaps].sort(compareNewestFirst);
    expect(sorted.map((r) => `${r.season}/${r.gameweek}`)).toEqual(["2026-27/12", "2026-27/3", "2025-26/38", "2025-26/1"]);
  });

  it("loads files newest first", () => {
    for (const r of recaps) write(`${r.season}/gw${String(r.gameweek).padStart(2, "0")}.json`, sampleRecap({ season: r.season, gameweek: r.gameweek }));
    expect(loadRecaps(dir).map((r) => r.path)).toEqual([
      "/recap/2026-27/gw12/",
      "/recap/2026-27/gw3/",
      "/recap/2025-26/gw38/",
      "/recap/2025-26/gw1/",
    ]);
  });

  it("picks the newest as the latest, or none", () => {
    expect(latestRecap([...recaps].sort(compareNewestFirst))?.path).toBe("/recap/2026-27/gw12/");
    expect(latestRecap([])).toBeNull();
  });
});

describe("previous and next", () => {
  const recaps = [published("2026-27", 5), published("2026-27", 3), published("2025-26", 38)];

  it("links to the next older and next newer recap, skipping gaps", () => {
    const { previous, next } = adjacentRecaps(recaps, { season: "2026-27", gameweek: 3 });
    expect(previous?.path).toBe("/recap/2025-26/gw38/");
    expect(next?.path).toBe("/recap/2026-27/gw5/");
  });

  it("has no next for the newest and no previous for the oldest", () => {
    expect(adjacentRecaps(recaps, { season: "2026-27", gameweek: 5 }).next).toBeNull();
    expect(adjacentRecaps(recaps, { season: "2025-26", gameweek: 38 }).previous).toBeNull();
  });

  it("has neither for a single recap or an unknown one", () => {
    expect(adjacentRecaps([recaps[0]], recaps[0])).toEqual({ previous: null, next: null });
    expect(adjacentRecaps(recaps, { season: "2026-27", gameweek: 4 })).toEqual({ previous: null, next: null });
  });

  it("finds a recap by season and gameweek", () => {
    expect(findRecap(recaps, "2026-27", 3)?.path).toBe("/recap/2026-27/gw3/");
    expect(findRecap(recaps, "2026-27", 4)).toBeNull();
  });
});

describe("helpers", () => {
  it("parses only gw<N> route params for gameweeks 1-99", () => {
    expect(parseGameweekParam("gw4")).toBe(4);
    expect(parseGameweekParam("gw38")).toBe(38);
    for (const bad of ["gw0", "gw04", "4", "gw", "gw4x", "GW4", "gw100"]) {
      expect(parseGameweekParam(bad), bad).toBeNull();
    }
  });

  it("writes seasons as FPL does", () => {
    expect(formatSeason("2026-27")).toBe("2026/27");
  });
});

describe("content/recaps", () => {
  // The published recaps. The deploy builds from this folder, so an invalid
  // recap fails here, on its PR, before it can fail a deploy.
  it("holds only valid, checked recaps (or none)", () => {
    const recaps = loadRecaps(path.join(__dirname, "..", DEFAULT_RECAP_DIR));
    for (const r of recaps) expect(r.model, r.path).not.toBe("hand-written");
  });
});

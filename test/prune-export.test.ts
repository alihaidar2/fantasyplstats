import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pruneExport } from "../scripts/prune-export";
import { packPlayerGameweeks, unpackPlayerGameweeks, type PlayerGameweek } from "../src/lib/fpl";

describe("pruneExport", () => {
  it("removes __next._full.txt only where it duplicates index.txt, and counts what's left", () => {
    const dir = mkdtempSync(join(tmpdir(), "prune-"));
    const page = (path: string, index: string, full: string) => {
      mkdirSync(join(dir, path), { recursive: true });
      writeFileSync(join(dir, path, "index.html"), "<html></html>");
      writeFileSync(join(dir, path, "index.txt"), index);
      writeFileSync(join(dir, path, "__next._full.txt"), full);
    };
    page("players/1", "payload-1", "payload-1");
    page("matches/2", "payload-2", "payload-2");
    page("odd", "payload-3", "something else");

    const result = pruneExport(dir);

    expect(result.removed).toBe(2);
    expect(result.removedBytes).toBe(18);
    expect(existsSync(join(dir, "players/1/__next._full.txt"))).toBe(false);
    expect(existsSync(join(dir, "players/1/index.txt"))).toBe(true);
    expect(existsSync(join(dir, "odd/__next._full.txt"))).toBe(true);
    expect(result.kept).toEqual([join(dir, "odd/__next._full.txt")]);
    expect(result.files).toBe(7);
  });
});

describe("packed player history", () => {
  it("round-trips every field", () => {
    const rows: PlayerGameweek[] = [
      { gameweek: 1, points: 6, minutes: 90, goals: 1, assists: 0, xg: 0.42, xa: 0.1, bonus: 2, bps: 30, defensiveContribution: 4, price: 6.5, selected: 123456, transfersBalance: -789 },
      { gameweek: 2, points: 0, minutes: 0, goals: 0, assists: 0, xg: 0, xa: 0, bonus: 0, bps: 0, defensiveContribution: 0, price: 6.4, selected: 120000, transfersBalance: 0 },
    ];
    const packed = packPlayerGameweeks(rows);
    expect(packed[0]).toHaveLength(13);
    expect(unpackPlayerGameweeks(JSON.parse(JSON.stringify(packed)))).toEqual(rows);
  });
});

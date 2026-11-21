import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCHEDULES,
  isMatchDay,
  planScheduledRun,
  startOfUkDay,
  teamsThatPlayed,
  ukDateKey,
  ukOffsetMinutes,
  type Fixture,
} from "../src/lib/fpl";

const fixture = (id: number, kickoff: string | null, team_h = 1, team_a = 2): Fixture => ({
  id,
  event: 1,
  kickoff_time: kickoff,
  started: false,
  finished: false,
  team_h,
  team_a,
  team_h_difficulty: 3,
  team_a_difficulty: 3,
});

describe("UK time", () => {
  it("uses the UK calendar date, not UTC", () => {
    // 23:30 UTC on 20 Aug is 00:30 BST on 21 Aug.
    expect(ukDateKey(new Date("2026-08-20T23:30:00Z"))).toBe("2026-08-21");
    // In winter the UK is on UTC.
    expect(ukDateKey(new Date("2026-11-20T23:30:00Z"))).toBe("2026-11-20");
  });

  it("knows the offset in GMT and BST", () => {
    expect(ukOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(0);
    expect(ukOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(60);
  });

  it("finds the start of the UK day, including on clock-change days", () => {
    expect(startOfUkDay(new Date("2026-11-21T17:00:00Z")).toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(startOfUkDay(new Date("2026-08-21T17:00:00Z")).toISOString()).toBe("2026-08-20T23:00:00.000Z");
    // Clocks go back at 01:00 UTC on 25 Oct 2026; that day began at 00:00 BST.
    expect(startOfUkDay(new Date("2026-10-25T20:00:00Z")).toISOString()).toBe("2026-10-24T23:00:00.000Z");
    // Clocks go forward at 01:00 UTC on 29 Mar 2026; that day began at 00:00 GMT.
    expect(startOfUkDay(new Date("2026-03-29T20:00:00Z")).toISOString()).toBe("2026-03-29T00:00:00.000Z");
  });
});

describe("match days", () => {
  const fixtures = [
    fixture(1, "2026-11-21T12:30:00Z", 1, 2),
    fixture(2, "2026-11-21T17:30:00Z", 3, 4),
    fixture(3, "2026-11-22T14:00:00Z", 5, 6),
    fixture(4, null, 7, 8),
  ];

  it("detects a UK day with any kickoff", () => {
    expect(isMatchDay(fixtures, new Date("2026-11-21T08:00:00Z"))).toBe(true);
    expect(isMatchDay(fixtures, new Date("2026-11-23T08:00:00Z"))).toBe(false);
  });

  it("counts a late UTC kickoff on the UK date it falls on", () => {
    const late = [fixture(1, "2026-08-21T23:15:00Z")]; // 00:15 BST on 22 Aug
    expect(isMatchDay(late, new Date("2026-08-22T10:00:00Z"))).toBe(true);
    expect(isMatchDay(late, new Date("2026-08-21T10:00:00Z"))).toBe(false);
  });

  it("lists teams whose fixtures kicked off in the window", () => {
    const since = new Date("2026-11-21T00:00:00Z");
    expect([...teamsThatPlayed(fixtures, since, new Date("2026-11-21T15:00:00Z"))]).toEqual([1, 2]);
    expect([...teamsThatPlayed(fixtures, since, new Date("2026-11-21T18:00:00Z"))].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("planScheduledRun", () => {
  const matchDay = [fixture(1, "2026-11-21T15:00:00Z")];
  const saturday = new Date("2026-11-21T10:05:00Z");
  const monday = new Date("2026-11-23T10:05:00Z");

  it("runs every 30 minutes only on match days", () => {
    expect(planScheduledRun("5,35 * * * *", saturday, matchDay).run).toBe(true);
    expect(planScheduledRun("5,35 * * * *", monday, matchDay).run).toBe(false);
  });

  it("runs every 2 hours only on days without matches", () => {
    expect(planScheduledRun("20 */2 * * *", saturday, matchDay).run).toBe(false);
    expect(planScheduledRun("20 */2 * * *", monday, matchDay).run).toBe(true);
  });

  it("runs once after the price change, at 01:40 UK time in GMT and BST", () => {
    const winter = new Date("2026-11-24T01:40:00Z");
    const summer = new Date("2026-08-25T00:40:00Z");
    expect(planScheduledRun("40 1 * * *", winter, matchDay).run).toBe(true);
    expect(planScheduledRun("40 0 * * *", winter, matchDay).run).toBe(false);
    expect(planScheduledRun("40 0 * * *", summer, matchDay).run).toBe(true);
    expect(planScheduledRun("40 1 * * *", summer, matchDay).run).toBe(false);
  });

  it("falls back to the 30-minute schedule when there is no previous snapshot", () => {
    expect(planScheduledRun("5,35 * * * *", monday, null).run).toBe(true);
    expect(planScheduledRun("20 */2 * * *", monday, null).run).toBe(false);
  });

  it("runs on an unknown schedule rather than silently stopping", () => {
    expect(planScheduledRun("0 * * * *", monday, matchDay).run).toBe(true);
  });
});

it("matches the cron schedules in the deploy workflow", () => {
  const dir = path.join(__dirname, "..", ".github", "workflows");
  const workflow = readdirSync(dir)
    .filter((f) => f.startsWith("azure-static-web-apps"))
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  const crons = [...workflow.matchAll(/-\s*cron:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  expect(crons.sort()).toEqual(Object.keys(SCHEDULES).sort());
});

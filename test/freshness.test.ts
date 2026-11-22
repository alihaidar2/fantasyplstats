import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_AGE_HOURS, checkFreshness, parseMaxAgeHours } from "../scripts/freshness";

const now = new Date("2026-11-22T12:00:00Z");
const health = (generatedAt: unknown) => ({ generatedAt, currentGameweek: 11, nextGameweek: 12, players: 674 });

describe("checkFreshness", () => {
  it("passes recent data", () => {
    const result = checkFreshness(health("2026-11-22T10:30:00.000Z"), now, 6);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("1.5 h ago");
  });

  it("passes data exactly at the limit", () => {
    expect(checkFreshness(health("2026-11-22T06:00:00Z"), now, 6).ok).toBe(true);
  });

  it("fails stale data", () => {
    const result = checkFreshness(health("2026-11-22T05:59:00Z"), now, 6);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/stale/);
  });

  it("accepts timestamps with a UTC offset", () => {
    // 13:30+02:00 is 11:30Z.
    expect(checkFreshness(health("2026-11-22T13:30:00+02:00"), now, 6).ok).toBe(true);
  });

  it("allows a few minutes of clock skew but fails timestamps further in the future", () => {
    expect(checkFreshness(health("2026-11-22T12:03:00Z"), now, 6).ok).toBe(true);
    const result = checkFreshness(health("2026-11-22T13:00:00Z"), now, 6);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/future/);
  });

  it.each([
    ["a missing generatedAt", { currentGameweek: 11 }],
    ["an unparseable generatedAt", health("yesterday")],
    ["a numeric generatedAt", health(1763812800000)],
    ["a date without a time", health("2026-11-22")],
    ["a non-object body", "<html>not json</html>"],
    ["null", null],
    ["a non-numeric gameweek", { generatedAt: "2026-11-22T11:00:00Z", currentGameweek: "11" }],
  ])("fails %s", (_, body) => {
    const result = checkFreshness(body, now, 6);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/invalid/);
  });

  it("allows a null gameweek (off-season)", () => {
    expect(checkFreshness({ generatedAt: "2026-11-22T11:00:00Z", currentGameweek: null }, now, 6).ok).toBe(true);
  });
});

describe("parseMaxAgeHours", () => {
  it("defaults when unset or empty", () => {
    expect(parseMaxAgeHours(undefined)).toBe(DEFAULT_MAX_AGE_HOURS);
    expect(parseMaxAgeHours("")).toBe(DEFAULT_MAX_AGE_HOURS);
  });

  it("parses positive numbers", () => {
    expect(parseMaxAgeHours("12")).toBe(12);
    expect(parseMaxAgeHours("0.5")).toBe(0.5);
  });

  it.each(["0", "-1", "abc", "Infinity"])("rejects %s", (value) => {
    expect(() => parseMaxAgeHours(value)).toThrow(/MAX_AGE_HOURS/);
  });
});

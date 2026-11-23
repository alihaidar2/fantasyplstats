import { describe, expect, it } from "vitest";
import { extractNumbers } from "../../src/lib/recap/numbers";
import { isGameweekField, isSeasonField, statsOfField, writtenStat } from "../../src/lib/recap/stats";

/** The stat of each number in a sentence, read the way the checker does: up to the neighbouring number. */
function read(text: string) {
  const numbers = extractNumbers(text);
  return numbers.map((token, i) => {
    const before = text.slice(i > 0 ? numbers[i - 1].end : 0, token.start);
    const after = text.slice(token.end, i + 1 < numbers.length ? numbers[i + 1].start : text.length);
    const written = writtenStat(token, before, after);
    return [token.text, written.stats?.[0] ?? null, ...(written.gameweekWide ? ["gameweek-wide"] : [])];
  });
}

describe("statsOfField", () => {
  it("tags a tool result's numbers from their field names", () => {
    expect(statsOfField("points", {})).toEqual(["points"]);
    expect(statsOfField("seasonPoints", {})).toEqual(["points"]);
    expect(statsOfField("assists", {})).toEqual(["assists"]);
    expect(statsOfField("ownership", {})).toEqual(["ownership"]);
    expect(statsOfField("ownedBy", {})).toContain("owners");
    expect(statsOfField("netTransfersIn", {})).toContain("transfers");
    expect(statsOfField("priceChange", {})).toEqual(["price"]);
    expect(statsOfField("averageScore", {})).toEqual(["averageScore", "points"]);
    expect(statsOfField("gameweeksInARowWithAGoalOrAssist", {})).toEqual(["streak"]);
    expect(statsOfField("doubleDigitHauls", {})).toEqual([]);
  });

  it("reads a points-breakdown line and a chip count from the object they are in", () => {
    const line = { stat: "goals_scored", value: 2, points: 12 };
    expect(statsOfField("value", line)).toEqual(["goals"]);
    expect(statsOfField("points", line)).toContain("points");
    expect(statsOfField("played", { chip: "Triple Captain", played: 323226 })).toContain("chips");
    expect(statsOfField("played", { position: 5, played: 4 })).toEqual(["matches"]);
  });

  it("knows which fields are gameweek labels and which hold season totals", () => {
    expect(["gameweek", "bestScoreGameweek"].every(isGameweekField)).toBe(true);
    expect(isGameweekField("gameweeksPlayed")).toBe(false);
    expect(["season", "seasonPoints", "seasonLeaders", "sinceFirstGameweek", "priceChangeSinceFirstGameweek"].every(isSeasonField)).toBe(true);
    expect(isSeasonField("thisGameweek")).toBe(false);
  });
});

describe("writtenStat", () => {
  it("reads the stat word after a number", () => {
    expect(read("a goal, two assists and 17 points")).toEqual([["two", "assists"], ["17", "points"]]);
    expect(read("3 bonus points, 56 BPS and 90 minutes")).toEqual([["3", "bonus"], ["56", "bps"], ["90", "minutes"]]);
    expect(read("a 17-point haul, 15 pts and two more goals")).toEqual([["17", "points"], ["15", "points"], ["two", "goals"]]);
    expect(read("12 defensive contributions, 2 clean sheets, 5 saves")).toEqual([
      ["12", "defensiveContribution"],
      ["2", "cleanSheets"],
      ["5", "saves"],
    ]);
    expect(read("two yellow cards and 1 red card")).toEqual([["two", "yellowCards"], ["1", "redCards"]]);
    expect(read("615,807 more managers sold him")).toEqual([["615,807", "managers"]]);
    expect(read("three wins in 4 matches")).toEqual([["three", "won"], ["4", "matches"]]);
  });

  it("reads shorthand: a brace, a hat-trick, scored twice", () => {
    expect(read("a brace")).toEqual([["brace", "goals"]]);
    expect(read("a hat-trick")).toEqual([["hat-trick", "goals"]]);
    expect(read("scored twice")).toEqual([["twice", "goals"]]);
    expect(read("assisted twice")).toEqual([["twice", "assists"]]);
    expect(read("twice came close")).toEqual([["twice", null]]);
  });

  it("reads a stat named before the number", () => {
    expect(read("an xG of 0.82 and expected assists of 0.19")).toEqual([["0.82", "xG"], ["0.19", "xA"]]);
    expect(read("owned by 7.3 million")).toEqual([["7.3 million", "owners"]]);
    expect(read("owned by just 15,098")).toEqual([["15,098", "owners"]]);
  });

  it("reads percentages as ownership and pounds as a price", () => {
    expect(read("in 74.3% of squads at £7.7m")).toEqual([["74.3%", "ownership"], ["£7.7m", "price"]]);
    expect(read("a 75% chance of playing")).toEqual([["75%", "chance"]]);
  });

  it("leaves a number untyped when the words don't say", () => {
    expect(read("finished on 151")).toEqual([["151", null]]);
    expect(read("his 3rd of the week")).toEqual([["3", null]]);
    expect(read("his 4th goal of the season")).toEqual([["4", "goals"]]);
  });

  it("spots a gameweek-wide figure", () => {
    expect(read("the average manager scored 69 points")).toEqual([["69", "averageScore", "gameweek-wide"]]);
    expect(read("managers scored 69 points on average")).toEqual([["69", "averageScore", "gameweek-wide"]]);
    expect(read("the highest-scoring manager reached 151 points")).toEqual([["151", "highestScore", "gameweek-wide"]]);
    expect(read("323,226 managers played the Triple Captain chip")).toEqual([["323,226", "chips", "gameweek-wide"]]);
    expect(read("There were four red cards")).toEqual([["four", "redCards", "gameweek-wide"]]);
    expect(read("one of 14 players to do so")).toEqual([["14", null, "gameweek-wide"]]);
  });

  it("doesn't borrow a stat or a cue from the next number along", () => {
    expect(read("9 points as the average manager scored 69 points")).toEqual([
      ["9", "points"],
      ["69", "averageScore", "gameweek-wide"],
    ]);
    expect(read("the average was 69 points and he got 9 points")).toEqual([
      ["69", "averageScore", "gameweek-wide"],
      ["9", "points"],
    ]);
  });
});

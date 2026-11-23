import { describe, expect, it } from "vitest";
import { extractNumbers, numberToken, numbersAgree, type NumberToken } from "../../src/lib/recap/numbers";

const read = (text: string) =>
  extractNumbers(text).map((n) => (n.other === undefined ? [n.kind, n.value] : [n.kind, n.value, n.other]));
const one = (text: string): NumberToken => {
  const tokens = extractNumbers(text);
  expect(tokens).toHaveLength(1);
  return tokens[0];
};

describe("extractNumbers", () => {
  it("reads points, prices, percentages, scores and counts", () => {
    expect(read("Haaland (17 points) won 4-1, owned by 45.2% at £14.5m.")).toEqual([
      ["plain", 17],
      ["score", 4, 1],
      ["percent", 45.2],
      ["price", 14.5],
    ]);
  });

  it("reads thousands separators and rounded magnitudes", () => {
    expect(read("1,234,567 transfers")).toEqual([["plain", 1234567]]);
    expect(one("4.2 million managers")).toMatchObject({ kind: "plain", value: 4_200_000, unit: 100_000 });
    expect(one("350k sales")).toMatchObject({ kind: "plain", value: 350_000, unit: 1000 });
    expect(read("17, 13 and 9")).toEqual([["plain", 17], ["plain", 13], ["plain", 9]]);
  });

  it("reads number words, but not 'one'", () => {
    expect(read("scored twice, his third hat-trick, two assists and a brace")).toEqual([
      ["plain", 2],
      ["plain", 3],
      ["plain", 2],
      ["plain", 2],
    ]);
    expect(read("one of the picks of the week")).toEqual([]);
    expect(read("a 17-point haul and his 3rd goal")).toEqual([["plain", 17], ["plain", 3]]);
  });

  it("tells gameweeks, seasons and scores apart from counts", () => {
    expect(read("Gameweek 3, GW4 and gameweek 12")).toEqual([["gameweek", 3], ["gameweek", 4], ["gameweek", 12]]);
    expect(read("the 2026/27 season")).toEqual([["season", 2026, 27]]);
    expect(read("a 2–0 win and a 3 - 3 draw")).toEqual([["score", 2, 0], ["score", 3, 3]]);
    expect(read("45 per cent")).toEqual([["percent", 45]]);
  });

  it("ignores digits inside refs, ids and names", () => {
    expect(read("p430 r3 xG B.Fernandes")).toEqual([]);
  });

  it("reads a negative number as its size", () => {
    expect(read("finished on -2 points")).toEqual([["plain", 2]]);
    expect(numberToken(-2).value).toBe(2);
  });

  it("does not end a sentence's number at the full stop", () => {
    expect(read("He scored 17. Then 6.5 more.")).toEqual([["plain", 17], ["plain", 6.5]]);
  });
});

describe("numbersAgree", () => {
  const written = (text: string) => one(text);

  it("needs whole numbers and prices to be equal", () => {
    expect(numbersAgree(written("17"), numberToken(17))).toBe(true);
    expect(numbersAgree(written("17"), numberToken(18))).toBe(false);
    expect(numbersAgree(written("2"), numberToken(1.87))).toBe(false);
    expect(numbersAgree(written("£6.3m"), written("£6.3m"))).toBe(true);
    expect(numbersAgree(written("£6.3m"), written("£6.4m"))).toBe(false);
    expect(numbersAgree(written("£6m"), written("£6.0m"))).toBe(true);
  });

  it("lets percentages, decimals and magnitudes round the evidence", () => {
    expect(numbersAgree(written("45%"), written("45.2%"))).toBe(true);
    expect(numbersAgree(written("46%"), written("45.2%"))).toBe(false);
    expect(numbersAgree(written("1.9"), numberToken(1.87))).toBe(true);
    expect(numbersAgree(written("1.8"), numberToken(1.87))).toBe(false);
    expect(numbersAgree(written("7.6 million"), numberToken(7_594_638))).toBe(true);
    expect(numbersAgree(written("7.7 million"), numberToken(7_594_638))).toBe(false);
  });

  it("never matches across kinds", () => {
    expect(numbersAgree(written("45.2"), written("45.2%"))).toBe(false);
    expect(numbersAgree(written("6.3"), written("£6.3m"))).toBe(false);
    expect(numbersAgree(written("3"), written("Gameweek 3"))).toBe(false);
  });

  it("accepts a score from either side", () => {
    expect(numbersAgree(written("3-1"), written("1-3"))).toBe(true);
    expect(numbersAgree(written("3-1"), written("3-2"))).toBe(false);
  });
});

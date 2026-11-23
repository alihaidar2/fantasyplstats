import { describe, expect, it } from "vitest";
import { buildPlayerRows } from "../src/lib/fpl";
import {
  compareSetPieces,
  formatInteger,
  formatPriceChange,
  formatSignedDecimal,
  formatSignedInteger,
  ordinal,
} from "../src/components/features/players/players-table-format";
import {
  ALWAYS_VISIBLE,
  PLAYERS_TABLE_VIEWS,
  getView,
  hashForView,
  sortingForView,
  viewFromHash,
  visibilityForView,
} from "../src/components/features/players/players-table-views";
import { loadBootstrap } from "./helpers";

describe("players table views", () => {
  it("shows every PlayerRow field in some view", () => {
    const row = buildPlayerRows(loadBootstrap())[0];
    // Shown inside other cells: the id in the link, positionId as the badge
    // colour and sort key, availability as the badge next to the name.
    const inOtherCells = ["id", "positionId", "availability"];
    const shown = new Set([...ALWAYS_VISIBLE, ...PLAYERS_TABLE_VIEWS.flatMap((v) => v.columns)]);
    const missing = Object.keys(row).filter((k) => !inOtherCells.includes(k) && !shown.has(k as never));
    expect(missing).toEqual([]);
  });

  it("sorts each view by one of its own columns by default", () => {
    for (const view of PLAYERS_TABLE_VIEWS) {
      expect(view.columns).toContain(view.defaultSort.id);
    }
    expect(getView("overview").defaultSort).toEqual({ id: "totalPoints", desc: true });
  });

  it("hides the columns a view doesn't list", () => {
    const visibility = visibilityForView(getView("attack"), ["name", "team", "xg", "price"]);
    expect(visibility).toEqual({ name: true, team: true, xg: true, price: false });
  });

  it("keeps a visible sort and falls back to the view's default otherwise", () => {
    const attack = getView("attack");
    expect(sortingForView([{ id: "team", desc: false }], attack)).toEqual([{ id: "team", desc: false }]);
    expect(sortingForView([{ id: "goals", desc: true }], attack)).toEqual([{ id: "goals", desc: true }]);
    expect(sortingForView([{ id: "totalPoints", desc: true }], attack)).toEqual([attack.defaultSort]);
    expect(sortingForView([], attack)).toEqual([attack.defaultSort]);
  });

  it("round-trips views through the URL hash", () => {
    for (const view of PLAYERS_TABLE_VIEWS) {
      expect(viewFromHash(hashForView(view.id))).toBe(view.id);
    }
    expect(hashForView("overview")).toBe("");
    expect(viewFromHash("#Defence")).toBe("defence");
    expect(viewFromHash("#nonsense")).toBe("overview");
  });
});

describe("players table formatting", () => {
  it("formats integers with en-GB thousands separators", () => {
    expect(formatInteger(1234567)).toBe("1,234,567");
    expect(formatSignedInteger(12345)).toBe("+12,345");
    expect(formatSignedInteger(-50)).toBe("−50");
    expect(formatSignedInteger(0)).toBe("0");
  });

  it("signs decimals and price changes, with zero unsigned", () => {
    expect(formatSignedDecimal(1.234)).toBe("+1.23");
    expect(formatSignedDecimal(-0.63)).toBe("−0.63");
    expect(formatSignedDecimal(-0)).toBe("0.00");
    expect(formatSignedDecimal(0.004)).toBe("0.00");
    expect(formatPriceChange(0.1)).toBe("+£0.1m");
    expect(formatPriceChange(-0.2)).toBe("−£0.2m");
    expect(formatPriceChange(0)).toBe("£0.0m");
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd",
    ]);
  });

  it("ranks set-piece duties by count, then best order", () => {
    const pen1 = { kind: "penalties", order: 1 } as const;
    const fk2 = { kind: "freekicks", order: 2 } as const;
    const crn3 = { kind: "corners", order: 3 } as const;
    const rows = [[], [crn3], [pen1], [fk2, crn3], [pen1, fk2]];
    const descending = [...rows].sort((a, b) => compareSetPieces(b, a));
    expect(descending).toEqual([[pen1, fk2], [fk2, crn3], [pen1], [crn3], []]);
  });
});

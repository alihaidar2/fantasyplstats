import { readFileSync } from "node:fs";
import path from "node:path";
import {
  bootstrapSchema,
  elementSummarySchema,
  fixturesSchema,
  type Bootstrap,
  type ElementSummary,
  type Fixture,
} from "../src/lib/fpl";

/** A fresh, unparsed copy of a recorded FPL response. */
export function loadRaw(name: string): unknown {
  return JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
}

export const loadBootstrap = (): Bootstrap => bootstrapSchema.parse(loadRaw("bootstrap-static.json"));
export const loadFixtures = (): Fixture[] => fixturesSchema.parse(loadRaw("fixtures.json"));
export const loadSummary = (id: number): ElementSummary =>
  elementSummarySchema.parse(loadRaw(`element-summary-${id}.json`));

export const ARSENAL = 1;

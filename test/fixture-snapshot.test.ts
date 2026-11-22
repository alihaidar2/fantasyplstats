import { describe, expect, it } from "vitest";
import { parseSnapshot } from "../src/lib/fpl";
import { buildFixtureSnapshot, createFixtureClient, RECORDED_SUMMARY_IDS } from "./fixture-client";
import { loadSummary } from "./helpers";

describe("fixture snapshot", () => {
  it("passes parseSnapshot and covers every player", async () => {
    const { snapshot, plan } = await buildFixtureSnapshot(new Date("2026-11-21T12:00:00Z"));
    const parsed = parseSnapshot(JSON.parse(JSON.stringify(snapshot)));

    expect(plan.mode).toBe("full");
    expect(parsed.bootstrap.elements.length).toBeGreaterThan(0);
    for (const e of parsed.bootstrap.elements) {
      expect(parsed.summaries[e.id], `summary for player ${e.id}`).toBeDefined();
    }
  });

  it("serves recorded summaries as-is", async () => {
    const client = createFixtureClient();
    for (const id of RECORDED_SUMMARY_IDS) {
      expect(await client.getElementSummary(id)).toEqual(loadSummary(id));
    }
  });
});

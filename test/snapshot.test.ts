import { describe, expect, it, vi } from "vitest";
import {
  SnapshotConsistencyError,
  buildSnapshot,
  checkConsistency,
  parseSnapshot,
  planSummaryRefresh,
  type Bootstrap,
  type SnapshotClient,
  type Snapshot,
} from "../src/lib/fpl";
import { ARSENAL, loadBootstrap, loadFixtures, loadSummary } from "./helpers";

// Fixture 51 (ARS v LEE) kicks off at 2026-10-10T11:30:00Z, a Saturday.
const KICKOFF = new Date("2026-10-10T11:30:00Z");
const DURING_MATCH = new Date("2026-10-10T12:15:00Z");
const MORNING = new Date("2026-10-10T09:05:00Z");

function fakeClient(bootstrap: Bootstrap = loadBootstrap()) {
  const getElementSummary = vi.fn(async (id: number) =>
    id === 430 ? loadSummary(430) : loadSummary(1),
  );
  const client: SnapshotClient = {
    getBootstrap: async () => bootstrap,
    getFixtures: async () => loadFixtures(),
    getElementSummary,
    // Empty but valid per-gameweek data: test/snapshot-gameweeks.test.ts covers the real thing.
    getDreamTeam: async () => ({ top_player: null, team: [] }),
    getEventLive: async () => ({ elements: [] }),
    getEventStatus: async () => ({ status: [], leagues: "" }),
  };
  return { client, getElementSummary };
}

async function previousSnapshot(at: Date): Promise<Snapshot> {
  return (await buildSnapshot({ client: fakeClient().client, now: at, forceFull: true })).snapshot;
}

describe("planSummaryRefresh", () => {
  const bootstrap = loadBootstrap();
  const fixtures = loadFixtures();
  const allIds = bootstrap.elements.map((e) => e.id);

  it("does a full refresh without a usable previous snapshot", async () => {
    expect(planSummaryRefresh({ bootstrap, fixtures, previous: null, now: DURING_MATCH }).mode).toBe("full");

    const stale = await previousSnapshot(new Date(KICKOFF.getTime() - 2 * 24 * 3600_000));
    const plan = planSummaryRefresh({ bootstrap, fixtures, previous: stale, now: DURING_MATCH });
    expect(plan).toMatchObject({ mode: "full", refetch: allIds, reuse: [] });
  });

  it("does a full refresh on days without matches", async () => {
    const wednesday = new Date("2026-10-14T10:00:00Z");
    const previous = await previousSnapshot(new Date("2026-10-14T08:00:00Z"));
    expect(planSummaryRefresh({ bootstrap, fixtures, previous, now: wednesday }).mode).toBe("full");
  });

  it("does a full refresh when the previous snapshot is from another season", async () => {
    const previous = await previousSnapshot(MORNING);
    previous.bootstrap.events[0].deadline_time = "2025-08-15T17:30:00Z";
    expect(planSummaryRefresh({ bootstrap, fixtures, previous, now: DURING_MATCH }).mode).toBe("full");
  });

  it("refetches nothing on a match day before anyone has kicked off", async () => {
    const previous = await previousSnapshot(new Date("2026-10-10T08:35:00Z"));
    const plan = planSummaryRefresh({ bootstrap, fixtures, previous, now: MORNING });
    expect(plan).toMatchObject({ mode: "incremental", refetch: [], reuse: allIds });
  });

  it("refetches only players whose team has played", async () => {
    const previous = await previousSnapshot(MORNING);
    const plan = planSummaryRefresh({ bootstrap, fixtures, previous, now: DURING_MATCH });
    const arsenal = bootstrap.elements.filter((e) => e.team === ARSENAL).map((e) => e.id);
    expect(plan.mode).toBe("incremental");
    expect(plan.refetch).toEqual(arsenal);
    expect(plan.reuse).toEqual(allIds.filter((id) => !arsenal.includes(id)));
  });

  it("refetches new players and players who changed team", async () => {
    const previous = await previousSnapshot(MORNING);
    const mount = previous.bootstrap.elements.find((e) => e.id === 430)!;
    mount.team = 2;
    previous.bootstrap.elements = previous.bootstrap.elements.filter((e) => e.id !== 12);
    delete previous.summaries[12];

    const plan = planSummaryRefresh({ bootstrap, fixtures, previous, now: MORNING });
    expect(plan.refetch.sort()).toEqual([12, 430]);
  });
});

describe("buildSnapshot", () => {
  it("reuses summaries from the previous snapshot on match days", async () => {
    const previous = await previousSnapshot(MORNING);
    const { client, getElementSummary } = fakeClient();
    const { snapshot, plan } = await buildSnapshot({ client, previous, now: DURING_MATCH });

    expect(plan.mode).toBe("incremental");
    expect(getElementSummary).toHaveBeenCalledTimes(plan.refetch.length);
    expect(snapshot.mode).toBe("incremental");
    expect(snapshot.generatedAt).toBe(DURING_MATCH.toISOString());
    expect(Object.keys(snapshot.summaries)).toHaveLength(snapshot.bootstrap.elements.length);
    expect(snapshot.summaries[430]).toEqual(previous.summaries[430]);
  });

  it("fails if FPL data refers to a team that does not exist", async () => {
    const bootstrap = loadBootstrap();
    bootstrap.elements[0].team = 99;
    await expect(
      buildSnapshot({ client: fakeClient(bootstrap).client, now: MORNING }),
    ).rejects.toThrow(SnapshotConsistencyError);
  });

  it("fails if any player's element-summary request fails", async () => {
    const { client } = fakeClient();
    client.getElementSummary = async (id) => {
      if (id === 12) throw new Error("HTTP 503");
      return loadSummary(1);
    };
    await expect(buildSnapshot({ client, now: MORNING })).rejects.toThrow("HTTP 503");
  });
});

describe("parseSnapshot", () => {
  it("round-trips through JSON", async () => {
    const snapshot = await previousSnapshot(MORNING);
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("rejects an older snapshot version, so fetch refetches every player", async () => {
    const snapshot = await previousSnapshot(MORNING);
    expect(snapshot.version).toBe(4);
    expect(() => parseSnapshot({ ...snapshot, version: 3 })).toThrow();
  });

  it("rejects a reused summary that lacks the per-gameweek fields added in version 2", async () => {
    const snapshot = JSON.parse(JSON.stringify(await previousSnapshot(MORNING)));
    for (const h of snapshot.summaries[430].history) delete h.selected;
    expect(() => parseSnapshot(snapshot)).toThrow();
  });

  it("rejects a snapshot missing a player's summary", async () => {
    const snapshot = await previousSnapshot(MORNING);
    delete snapshot.summaries[430];
    expect(() => parseSnapshot(snapshot)).toThrow(/no element-summary/);
  });
});

it("checkConsistency catches fixtures in unknown gameweeks", () => {
  const fixtures = loadFixtures();
  fixtures[0].event = 30;
  expect(() => checkConsistency(loadBootstrap(), fixtures)).toThrow(/unknown gameweek 30/);
});

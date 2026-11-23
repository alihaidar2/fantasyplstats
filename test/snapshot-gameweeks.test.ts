// Snapshot version 4: per-match stats, teams of the week and live data.

import { describe, expect, it, vi } from "vitest";
import {
  MATCH_STAT_IDENTIFIERS,
  SNAPSHOT_LIVE_STATS,
  SNAPSHOT_VERSION,
  SnapshotConsistencyError,
  buildSnapshot,
  checkConsistency,
  dreamTeamSchema,
  eventLiveSchema,
  eventStatusSchema,
  fixturesSchema,
  parsePreviousSnapshot,
  parseSnapshot,
  planDreamTeams,
  snapshotSizes,
  trimLive,
  unknownStatIdentifiers,
  type Snapshot,
  type SnapshotClient,
} from "../src/lib/fpl";
import { buildFixtureSnapshot, createFixtureClient, loadRecordedGameweek } from "./fixture-client";
import { loadRaw } from "./helpers";
import { loadRecapRaw } from "./recap/helpers";

const NOW = new Date("2026-11-21T12:00:00Z");
const RECORDED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const gwFile = (gw: number, name: string) => `gameweeks/gw${String(gw).padStart(2, "0")}/${name}`;

/** The CI fixture client, with spies on the per-gameweek requests. */
function spyClient() {
  const client = createFixtureClient();
  const getDreamTeam = vi.fn(client.getDreamTeam);
  const getEventLive = vi.fn(client.getEventLive);
  const getEventStatus = vi.fn(client.getEventStatus);
  const spied: SnapshotClient = { ...client, getDreamTeam, getEventLive, getEventStatus };
  return { client: spied, getDreamTeam, getEventLive, getEventStatus };
}

const fixtureSnapshot = async () => (await buildFixtureSnapshot(NOW)).snapshot;

/** A copy of a snapshot as an older version would have written it. */
function asVersion3(snapshot: Snapshot): unknown {
  const json = JSON.parse(JSON.stringify(snapshot));
  json.version = 3;
  delete json.dreamTeams;
  delete json.live;
  for (const f of json.fixtures) {
    delete f.stats;
    delete f.finished_provisional;
    delete f.minutes;
  }
  return json;
}

describe("schemas against the recorded responses", () => {
  it("keep every fixture's match stats, finished_provisional and minutes", () => {
    for (const gw of RECORDED) {
      const fixtures = fixturesSchema.parse(loadRaw(gwFile(gw, "fixtures.json")));
      expect(fixtures).toHaveLength(10);
      for (const f of fixtures) {
        expect(f.finished_provisional, `fixture ${f.id}`).toBe(true);
        expect(f.minutes, `fixture ${f.id}`).toBe(90);
        expect(f.stats.map((s) => s.identifier)).toEqual([...MATCH_STAT_IDENTIFIERS]);
        expect(f).not.toHaveProperty("pulse_id");
      }
      expect(unknownStatIdentifiers(fixtures)).toEqual([]);
    }
  });

  it("match each fixture's goals to its score", () => {
    for (const gw of RECORDED) {
      for (const f of fixturesSchema.parse(loadRaw(gwFile(gw, "fixtures.json")))) {
        const goals = f.stats.find((s) => s.identifier === "goals_scored")!;
        const ownGoals = f.stats.find((s) => s.identifier === "own_goals")!;
        const sum = (rows: { value: number }[]) => rows.reduce((n, r) => n + r.value, 0);
        // An own goal is listed under the side of the player who scored it, and counts for the other side.
        expect(sum(goals.h) + sum(ownGoals.a), `fixture ${f.id} home`).toBe(f.team_h_score);
        expect(sum(goals.a) + sum(ownGoals.h), `fixture ${f.id} away`).toBe(f.team_a_score);
      }
    }
  });

  it("keep an identifier FPL adds later instead of failing", () => {
    const raw = loadRaw(gwFile(3, "fixtures.json")) as { stats: unknown[] }[];
    raw[0].stats.push({ identifier: "shots_on_target", h: [{ value: 2, element: 1 }], a: [] });
    const fixtures = fixturesSchema.parse(raw);
    expect(fixtures[0].stats.at(-1)).toEqual({ identifier: "shots_on_target", h: [{ value: 2, element: 1 }], a: [] });
    expect(unknownStatIdentifiers(fixtures)).toEqual(["shots_on_target"]);
  });

  it("parse every recorded team of the week, live gameweek and event-status", () => {
    for (const gw of RECORDED) {
      const team = dreamTeamSchema.parse(loadRaw(gwFile(gw, "dream-team.json")));
      expect(team.team).toHaveLength(11);
      expect(team.team.map((d) => d.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(team.top_player).not.toBeNull();
      expect(eventLiveSchema.parse(loadRaw(gwFile(gw, "live.json"))).elements.length).toBeGreaterThan(250);
    }
    expect(eventStatusSchema.parse(loadRaw("recap/event-status.json")).status).toHaveLength(3);
  });
});

describe("trimLive", () => {
  const { live } = loadRecordedGameweek(3);
  const status = eventStatusSchema.parse(loadRaw("recap/event-status.json"));

  it("keeps only the snapshot's stats and the points breakdown", () => {
    const trimmed = trimLive(3, live, status);
    const raya = trimmed.elements.find((e) => e.id === 1)!;
    expect(Object.keys(raya.stats)).toEqual(SNAPSHOT_LIVE_STATS);
    expect(raya.stats).toMatchObject({ minutes: 90, saves: 4, bps: 15, total_points: 3 });
    // points_modification (always 0 in the recordings) is dropped.
    expect(raya.explain).toEqual([
      {
        fixture: 29,
        stats: [
          { identifier: "minutes", points: 2, value: 90 },
          { identifier: "saves", points: 1, value: 4 },
        ],
      },
    ]);
    expect(trimmed.status).toEqual(status);
  });

  it("drops players with nothing so far", () => {
    const withIdle = structuredClone(live);
    const idle = structuredClone(withIdle.elements[0]);
    idle.id = 999;
    for (const key of Object.keys(idle.stats) as (keyof typeof idle.stats)[]) {
      const value = idle.stats[key];
      (idle.stats as Record<string, unknown>)[key] = typeof value === "number" ? 0 : typeof value === "string" ? "0.00" : false;
    }
    withIdle.elements.push(idle);
    const trimmed = trimLive(3, withIdle, status);
    expect(trimmed.elements.map((e) => e.id)).not.toContain(999);
    expect(trimmed.elements).toHaveLength(live.elements.length);
  });

  it("stays small even with the points breakdown (about 120 KB for a gameweek)", () => {
    const raw = JSON.stringify(loadRaw(gwFile(3, "live.json"))).length;
    const kept = JSON.stringify(trimLive(3, live, status)).length;
    expect(kept).toBeLessThan(raw * 0.6);
    expect(kept).toBeLessThan(150_000);
  });
});

describe("teams of the week", () => {
  it("are fetched for settled gameweeks only", async () => {
    const { client, getDreamTeam } = spyClient();
    const { snapshot, dreamTeamPlan } = await buildSnapshot({ client, now: NOW });
    expect(dreamTeamPlan).toEqual({ fetch: [1, 2], reuse: [] });
    expect(getDreamTeam.mock.calls.map(([gw]) => gw)).toEqual([1, 2]);
    expect(Object.keys(snapshot.dreamTeams)).toEqual(["1", "2"]);
    expect(snapshot.dreamTeams[1]).toEqual(loadRecordedGameweek(1).dreamTeam);
  });

  it("are reused from the previous snapshot, however old, and never refetched", async () => {
    const previous = await fixtureSnapshot();
    previous.generatedAt = "2026-10-01T00:00:00.000Z";
    previous.dreamTeams[1].top_player!.points = 99; // marks the copy as reused

    const { client, getDreamTeam } = spyClient();
    const { snapshot, dreamTeamPlan, plan } = await buildSnapshot({ client, previous, now: NOW });
    expect(plan.mode).toBe("full"); // too old for element summaries...
    expect(dreamTeamPlan).toEqual({ fetch: [], reuse: [1, 2] }); // ...but not for settled weeks
    expect(getDreamTeam).not.toHaveBeenCalled();
    expect(snapshot.dreamTeams[1].top_player!.points).toBe(99);
  });

  it("fetch only a newly settled gameweek", async () => {
    const previous = await fixtureSnapshot();
    const client = createFixtureClient();
    const bootstrap = await client.getBootstrap();
    const gw3 = bootstrap.events.find((e) => e.id === 3)!;
    Object.assign(gw3, { finished: true, data_checked: true });
    expect(planDreamTeams({ bootstrap, previous })).toEqual({ fetch: [3], reuse: [1, 2] });

    // Finished but not yet checked: not settled, so no entry yet.
    gw3.data_checked = false;
    expect(planDreamTeams({ bootstrap, previous })).toEqual({ fetch: [], reuse: [1, 2] });
  });

  it("are refetched on a full refresh or in a new season", async () => {
    const previous = await fixtureSnapshot();
    const bootstrap = await createFixtureClient().getBootstrap();
    expect(planDreamTeams({ bootstrap, previous, forceFull: true })).toEqual({ fetch: [1, 2], reuse: [] });

    previous.bootstrap.events[0].deadline_time = "2025-08-15T17:30:00Z";
    expect(planDreamTeams({ bootstrap, previous })).toEqual({ fetch: [1, 2], reuse: [] });
    expect(planDreamTeams({ bootstrap, previous: null })).toEqual({ fetch: [1, 2], reuse: [] });
  });

  it("fail the build when a settled gameweek's team can't be fetched", async () => {
    const client = createFixtureClient();
    client.getDreamTeam = async () => {
      throw new Error("HTTP 503");
    };
    await expect(buildSnapshot({ client, now: NOW })).rejects.toThrow("HTTP 503");
  });
});

describe("live data", () => {
  it("is refetched for the current gameweek on every build", async () => {
    const previous = await fixtureSnapshot();
    const { client, getEventLive, getEventStatus } = spyClient();
    const { snapshot } = await buildSnapshot({ client, previous, now: NOW });
    expect(getEventLive.mock.calls).toEqual([[3]]);
    expect(getEventStatus).toHaveBeenCalledTimes(1);
    expect(snapshot.live?.gameweek).toBe(3);
    expect(snapshot.live?.status.status.map((d) => d.event)).toEqual([3, 3, 3]);
  });

  it("is null when no gameweek is current", async () => {
    const { client, getEventLive, getEventStatus } = spyClient();
    const getBootstrap = client.getBootstrap;
    client.getBootstrap = async () => {
      const bootstrap = await getBootstrap();
      for (const e of bootstrap.events) e.is_current = false;
      return bootstrap;
    };
    const { snapshot } = await buildSnapshot({ client, now: NOW });
    expect(snapshot.live).toBeNull();
    expect(getEventLive).not.toHaveBeenCalled();
    expect(getEventStatus).not.toHaveBeenCalled();
  });

  it("can be empty before the gameweek's first kickoff", async () => {
    const client = createFixtureClient();
    client.getEventLive = async () => ({ elements: [] });
    const { snapshot } = await buildSnapshot({ client, now: NOW });
    expect(snapshot.live).toMatchObject({ gameweek: 3, elements: [] });
  });
});

describe("upgrading from version 3", () => {
  it("rejects a cached version 3 snapshot, so the next fetch refetches everything", async () => {
    const v4 = await fixtureSnapshot();
    const warn = vi.fn();
    expect(parsePreviousSnapshot(asVersion3(v4), warn)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "Ignoring the previous snapshot: it is version 3, and this build writes version 4",
    );
    expect(parsePreviousSnapshot(JSON.parse(JSON.stringify(v4)))).toEqual(v4);

    const { client, getDreamTeam } = spyClient();
    const { snapshot, plan, dreamTeamPlan } = await buildSnapshot({
      client,
      previous: parsePreviousSnapshot(asVersion3(v4)),
      now: NOW,
    });
    expect(SNAPSHOT_VERSION).toBe(4);
    expect(snapshot.version).toBe(4);
    expect(plan).toMatchObject({ mode: "full", reason: "no previous snapshot", reuse: [] });
    expect(dreamTeamPlan.reuse).toEqual([]);
    expect(getDreamTeam).toHaveBeenCalledTimes(2);
  });

  it("still rejects a version 4 snapshot without the new parts, with a short warning", async () => {
    const v4 = await fixtureSnapshot();
    for (const part of ["dreamTeams", "live"] as const) {
      const without: Partial<Snapshot> = { ...v4 };
      delete without[part];
      expect(() => parseSnapshot(without)).toThrow();
    }

    const broken = JSON.parse(JSON.stringify(v4));
    for (const f of broken.fixtures) delete f.stats;
    const warn = vi.fn();
    expect(parsePreviousSnapshot(broken, warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^Ignoring the previous snapshot: fixtures\.0\.stats: .*\(60 problems in all\)$/);
  });
});

describe("checkConsistency for the gameweek data", () => {
  async function parts() {
    const s = await fixtureSnapshot();
    return { s, check: () => checkConsistency(s.bootstrap, s.fixtures, s) };
  }

  it("passes for the fixture snapshot", async () => {
    const { check } = await parts();
    expect(check).not.toThrow();
  });

  it("rejects match stats naming an unknown player", async () => {
    const { s, check } = await parts();
    s.fixtures[0].stats[0].h.push({ element: 9999, value: 1 });
    expect(check).toThrow(SnapshotConsistencyError);
    expect(check).toThrow(/fixture \d+'s stats name unknown players: 9999/);
  });

  it("rejects a team of the week naming an unknown player, or for a gameweek that isn't settled", async () => {
    const { s, check } = await parts();
    s.dreamTeams[1].team[0].element = 9999;
    expect(check).toThrow(/gameweek 1's team of the week names unknown players: 9999/);

    const other = await parts();
    other.s.dreamTeams[3] = other.s.dreamTeams[1];
    expect(other.check).toThrow(/gameweek 3, which isn't settled/);

    const unknown = await parts();
    unknown.s.dreamTeams[40] = unknown.s.dreamTeams[1];
    expect(unknown.check).toThrow(/unknown gameweek 40/);
  });

  it("rejects live data naming an unknown player or fixture, or a player twice", async () => {
    const a = await parts();
    a.s.live!.elements[0].id = 9999;
    expect(a.check).toThrow(/live data names unknown players: 9999/);

    const b = await parts();
    b.s.live!.elements[0].explain[0].fixture = 9999;
    expect(b.check).toThrow(/unknown fixtures: 9999/);

    const c = await parts();
    c.s.live!.elements.push(structuredClone(c.s.live!.elements[0]));
    expect(c.check).toThrow(/more than once/);

    const d = await parts();
    d.s.live!.gameweek = 40;
    expect(d.check).toThrow(/live data for unknown gameweek 40/);
  });

  it("fails the build early when the fixtures name an unknown player", async () => {
    const client = createFixtureClient();
    const getFixtures = client.getFixtures;
    client.getFixtures = async () => {
      const fixtures = await getFixtures();
      fixtures[0].stats[0].a.push({ element: 9999, value: 1 });
      return fixtures;
    };
    const getElementSummary = vi.fn(client.getElementSummary);
    client.getElementSummary = getElementSummary;
    await expect(buildSnapshot({ client, now: NOW })).rejects.toThrow(/unknown players: 9999/);
    expect(getElementSummary).not.toHaveBeenCalled();
  });

  it("warns about, but keeps, a stat identifier it doesn't know", async () => {
    const client = createFixtureClient();
    const getFixtures = client.getFixtures;
    client.getFixtures = async () => {
      const fixtures = await getFixtures();
      fixtures[0].stats.push({ identifier: "shots_on_target", h: [{ element: 1, value: 2 }], a: [] });
      return fixtures;
    };
    const log = vi.fn();
    const { snapshot } = await buildSnapshot({ client, now: NOW, log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("warning: fixtures have stats this site doesn't know yet (kept as they are): shots_on_target"));
    expect(snapshot.fixtures[0].stats.at(-1)?.identifier).toBe("shots_on_target");
  });
});

describe("the CI fixture snapshot", () => {
  it("has match stats for every recorded fixture, teams of the week for GW1–2 and GW3 live data", async () => {
    const snapshot = await fixtureSnapshot();
    expect(snapshot.fixtures).toHaveLength(60);
    for (const f of snapshot.fixtures) {
      expect(f.stats.find((s) => s.identifier === "bps")!.h.length, `fixture ${f.id}`).toBeGreaterThan(0);
    }
    expect(Object.keys(snapshot.dreamTeams)).toEqual(["1", "2"]);
    for (const team of Object.values(snapshot.dreamTeams)) expect(team.team).toHaveLength(11);
    expect(snapshot.live?.gameweek).toBe(3);
    expect(snapshot.live?.elements).toHaveLength(loadRecordedGameweek(3).live.elements.length);
    expect(new Set(snapshot.live?.status.status.map((d) => d.date))).toEqual(
      new Set(["2026-09-04", "2026-09-05", "2026-09-06"]),
    );
  });

  it("includes every player the gameweek data names, with real history up to the current gameweek", async () => {
    const snapshot = await fixtureSnapshot();
    const ids = new Set(snapshot.bootstrap.elements.map((e) => e.id));
    expect(ids.size).toBe(436);
    for (const f of snapshot.fixtures) for (const s of f.stats) for (const r of [...s.h, ...s.a]) expect(ids.has(r.element)).toBe(true);
    for (const summary of Object.values(snapshot.summaries)) {
      for (const h of summary.history) expect(h.round).toBeLessThanOrEqual(3);
    }
    // Haaland (411) isn't in test/fixtures/bootstrap-static.json; his history comes from the gameweek recordings.
    expect(snapshot.summaries[411].history.map((h) => h.round)).toEqual([1, 2, 3]);
  });

  it("stays small", async () => {
    const sizes = snapshotSizes(await fixtureSnapshot());
    expect(sizes.total).toBeLessThan(1_500_000);
    expect(sizes.live).toBeLessThan(150_000);
  });
});

describe("the recorded recap snapshot", () => {
  it("is version 4 with GW3–4's teams of the week and GW4's live data", () => {
    const snapshot = parseSnapshot(loadRecapRaw("snapshot.json"));
    expect(snapshot.version).toBe(4);
    expect(Object.keys(snapshot.dreamTeams)).toEqual(["3", "4"]);
    expect(snapshot.live?.gameweek).toBe(4);
    // Its event-status is the recorded one, which describes GW11.
    expect(snapshot.live?.status.status[0].event).toBe(11);
  });
});

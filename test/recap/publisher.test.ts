import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventStatus, SnapshotClient, FplGameweekClient } from "../../src/lib/fpl";
import { fakeWriterModel } from "../../src/lib/recap/fakes";
import { scriptedModel } from "../../src/lib/recap/model";
import { recapSchema } from "../../src/lib/recap/recap";
import { loadRecaps } from "../../src/lib/recaps";
import { loadRecording } from "../../scripts/recorded-gameweeks";
import {
  PublishError,
  liveSource,
  publishRecap,
  recapPullRequestBody,
  recordedSource,
  selectGameweek,
  unsettledReason,
} from "../../scripts/recap-publisher";
import { loadSources, type SnapshotSources } from "./helpers";

// The weekly recap publisher (scripts/recap-publisher.ts): which gameweek it
// picks, and what it writes or refuses, with recorded data and scripted
// models. No network, and recaps go to a temporary folder.

const settled = (id: number) => ({ id, finished: true, data_checked: true });
const status = (event: number, points: string, bonus: boolean, date = "2026-11-22"): EventStatus => ({
  status: [{ event, date, points, bonus_added: bonus }],
  leagues: "",
});

describe("unsettledReason", () => {
  it("needs finished and data_checked", () => {
    expect(unsettledReason({ id: 11, finished: false, data_checked: false }, null)).toMatch(/hasn't finished/);
    expect(unsettledReason({ id: 11, finished: true, data_checked: false }, null)).toMatch(/data_checked is false/);
    expect(unsettledReason(settled(11), null)).toBeNull();
  });

  it("needs confirmed points and bonus while event-status describes the gameweek", () => {
    expect(unsettledReason(settled(11), status(11, "p", false))).toMatch(/2026-11-22 \(points "p", bonus not added\)/);
    expect(unsettledReason(settled(11), status(11, "r", false))).toMatch(/bonus not added/);
    expect(unsettledReason(settled(11), status(11, "r", true))).toBeNull();
  });

  it("goes by data_checked once event-status has moved on to a later gameweek", () => {
    expect(unsettledReason(settled(11), status(12, "", false))).toBeNull();
  });
});

describe("selectGameweek", () => {
  const events = [settled(9), settled(10), settled(11), { id: 12, finished: false, data_checked: false }];

  it("picks the latest finished gameweek once it is settled and has no recap", () => {
    expect(selectGameweek({ events, eventStatus: status(11, "r", true), published: [] })).toEqual({ gameweek: 11 });
    expect(selectGameweek({ events, eventStatus: status(12, "", false), published: [9, 10] })).toEqual({ gameweek: 11 });
  });

  it("waits while the latest finished gameweek isn't settled, rather than going back to an older one", () => {
    const checking = [settled(10), { id: 11, finished: true, data_checked: false }];
    expect(selectGameweek({ events: checking, eventStatus: null, published: [] })).toEqual({
      gameweek: null,
      reason: expect.stringMatching(/^waiting: FPL hasn't checked gameweek 11's data/),
    });
    expect(selectGameweek({ events, eventStatus: status(11, "p", true), published: [] })).toMatchObject({
      gameweek: null,
      reason: expect.stringMatching(/^waiting: event-status hasn't confirmed/),
    });
  });

  it("does nothing once the latest gameweek has a recap, and never backfills older ones", () => {
    expect(selectGameweek({ events, eventStatus: null, published: [11] })).toEqual({
      gameweek: null,
      reason: "gameweek 11 already has a recap",
    });
  });

  it("does nothing before any gameweek has finished", () => {
    expect(selectGameweek({ events: [{ id: 1, finished: false, data_checked: false }], eventStatus: null, published: [] })).toEqual({
      gameweek: null,
      reason: "no gameweek has finished yet",
    });
  });

  it("takes an explicit gameweek only if it is settled and unpublished", () => {
    expect(selectGameweek({ events, eventStatus: null, published: [11], requested: 9 })).toEqual({ gameweek: 9 });
    expect(() => selectGameweek({ events, eventStatus: null, published: [], requested: 12 })).toThrow(
      /Gameweek 12 isn't settled: gameweek 12 hasn't finished/,
    );
    expect(() => selectGameweek({ events, eventStatus: status(11, "p", false), published: [], requested: 11 })).toThrow(
      /isn't settled: event-status/,
    );
    expect(() => selectGameweek({ events, eventStatus: null, published: [11], requested: 11 })).toThrow(
      /Gameweek 11 already has a recap/,
    );
    expect(() => selectGameweek({ events, eventStatus: null, published: [], requested: 20 })).toThrow(PublishError);
  });
});

/** A live source over the recorded GW4 (test/fixtures/recap/), with a client that counts its requests. */
function fakeLive(edit?: (sources: SnapshotSources) => void) {
  const sources = loadSources(4);
  edit?.(sources);
  const requests: string[] = [];
  const client = {
    getBootstrap: async () => (requests.push("bootstrap"), sources.snapshot.bootstrap),
    getEventStatus: async () => (requests.push("event-status"), sources.eventStatus!),
    getEventLive: async (gw: number) => (requests.push(`live ${gw}`), sources.live),
    getGameweekFixtures: async (gw: number) => (requests.push(`fixtures ${gw}`), sources.fixtures),
    getDreamTeam: async (gw: number) => (requests.push(`dream-team ${gw}`), sources.dreamTeam),
  } as unknown as SnapshotClient & FplGameweekClient;
  return { source: liveSource({ client, snapshot: sources.snapshot }), requests };
}

/** A writer that submits a recap with an invented number every time. */
const inventingModel = () =>
  scriptedModel("inventing", () => ({
    calls: [
      {
        name: "submit_recap",
        input: {
          headline: "Somebody scored 999 points in Gameweek 4",
          paragraphs: [
            "Somebody scored 999 points in Gameweek 4, which nobody did. ".repeat(4),
            "The average manager scored 999 points as well, which is also made up. ".repeat(4),
          ],
          claims: [
            { text: "Somebody scored 999 points.", evidence: ["r1"] },
            { text: "The average was 999 points.", evidence: ["r1"] },
            { text: "That was Gameweek 4.", evidence: ["r1"] },
          ],
        },
      },
    ],
  }));

describe("publishRecap", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "recap-publish-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes a checked recap from live data, in the saved-recap schema, where the build reads it", async () => {
    const { source, requests } = fakeLive();
    const result = await publishRecap({ source, model: fakeWriterModel(), contentDir: dir, gameweek: 4 });

    const file = path.join(dir, "2026-27", "gw04.json");
    expect(result).toMatchObject({ status: "published", season: "2026-27", gameweek: 4, file, written: true });
    const saved = recapSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(saved).toMatchObject({ gameweek: 4, model: "fake-writer", checks: { passed: true }, run: { fallback: false } });
    expect(loadRecaps(dir).map((r) => r.gameweek)).toEqual([4]);
    expect(requests.sort()).toEqual(["bootstrap", "dream-team 4", "event-status", "event-status", "fixtures 4", "live 4"]);

    const body = recapPullRequestBody(saved, "content/recaps/2026-27/gw04.json");
    expect(body).toContain(`## ${saved.headline}`);
    for (const paragraph of saved.paragraphs) expect(body).toContain(paragraph);
    expect(body).toMatch(/checker passed on the first try/);
    expect(body).toMatch(/close and reopen this PR/);
  });

  it("refuses a gameweek that already has a recap, before calling the model", async () => {
    await publishRecap({ source: fakeLive().source, model: fakeWriterModel(), contentDir: dir, gameweek: 4 });
    const model = fakeWriterModel();
    await expect(publishRecap({ source: fakeLive().source, model, contentDir: dir, gameweek: 4 })).rejects.toThrow(
      /Gameweek 4 already has a recap/,
    );
    expect(model.requests).toHaveLength(0);
  });

  it("refuses a gameweek that isn't settled, before fetching its data or calling the model", async () => {
    const { source, requests } = fakeLive((s) => {
      s.snapshot.bootstrap.events.find((e) => e.id === 4)!.data_checked = false;
    });
    const model = fakeWriterModel();
    await expect(publishRecap({ source, model, contentDir: dir, gameweek: 4 })).rejects.toThrow(
      /Gameweek 4 isn't settled: FPL hasn't checked/,
    );
    expect(requests.sort()).toEqual(["bootstrap", "event-status"]);
    expect(model.requests).toHaveLength(0);
  });

  it("publishes nothing when the checker rejects the model's recap and the template is used", async () => {
    const model = inventingModel();
    const error = await publishRecap({ source: fakeLive().source, model, contentDir: dir, gameweek: 4 }).catch((e) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(error.message).toMatch(/^Not published: the model's recap of gameweek 4 didn't pass the checker \(the checker rejected both submissions\)/);
    expect(error.message).toMatch(/attempt 2, /);
    expect(model.requests).toHaveLength(2);
    expect(existsSync(path.join(dir, "2026-27"))).toBe(false);
  });

  it("writes nothing on a dry run", async () => {
    const result = await publishRecap({ source: fakeLive().source, model: fakeWriterModel(), contentDir: dir, gameweek: 4, dryRun: true });
    expect(result).toMatchObject({ status: "published", written: false });
    expect(existsSync(path.join(dir, "2026-27"))).toBe(false);
  });

  it("picks the latest settled gameweek by default, and does nothing once it is published", async () => {
    const source = recordedSource(loadRecording());
    expect(await publishRecap({ source, model: null, contentDir: dir, selectOnly: true })).toEqual({
      status: "selected",
      season: "2026-27",
      gameweek: 10,
      file: path.join(dir, "2026-27", "gw10.json"),
    });
    await publishRecap({ source, model: fakeWriterModel(), contentDir: dir });
    expect(await publishRecap({ source, model: null, contentDir: dir })).toEqual({
      status: "nothing-to-do",
      season: "2026-27",
      reason: "gameweek 10 already has a recap",
    });
  });
});

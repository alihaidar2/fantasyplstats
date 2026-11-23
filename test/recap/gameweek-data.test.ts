import { describe, expect, it, vi } from "vitest";
import {
  FplRequestError,
  FplValidationError,
  createFplClient,
  dreamTeamSchema,
  eventLiveSchema,
  eventStatusSchema,
  gameweekFixturesSchema,
} from "../../src/lib/fpl";
import { fetchGameweekSources } from "../../src/lib/recap/context";
import { loadRecapRaw } from "./helpers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A client whose fetch serves the recorded responses by URL. */
function recordedClient(overrides: Record<string, () => Response> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace("https://fpl.test/api/", "");
    if (overrides[path]) return overrides[path]();
    const live = /^event\/(\d+)\/live\/$/.exec(path);
    if (live) return json(loadRecapRaw(`live-${live[1]}.json`));
    const dream = /^dream-team\/(\d+)\/$/.exec(path);
    if (dream) return json(loadRecapRaw(`dream-team-${dream[1]}.json`));
    const fixtures = /^fixtures\/\?event=(\d+)$/.exec(path);
    if (fixtures) return json(loadRecapRaw(`fixtures-${fixtures[1]}.json`));
    if (path === "event-status/") return json(loadRecapRaw("event-status.json"));
    return json({ detail: "Not found." }, 404);
  });
  const client = createFplClient({
    baseUrl: "https://fpl.test/api",
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    retries: 1,
  });
  return { client, fetchMock };
}

describe("gameweek schemas", () => {
  it("parse the recorded responses and strip fields the recap does not use", () => {
    const live = eventLiveSchema.parse(loadRecapRaw("live-3.json"));
    const mitchell = live.elements.find((e) => e.id === 204)!;
    expect(mitchell.stats).toMatchObject({ total_points: 15, goals_scored: 2, minutes: 73, expected_goals: "0.66" });
    expect(mitchell.stats).not.toHaveProperty("influence");
    expect(mitchell.explain[0].stats).toContainEqual({ identifier: "goals_scored", value: 2, points: 12 });
    expect(mitchell).not.toHaveProperty("modified");

    const fixtures = gameweekFixturesSchema.parse(loadRecapRaw("fixtures-3.json"));
    expect(fixtures).toHaveLength(10);
    expect(fixtures.every((f) => f.event === 3 && f.finished)).toBe(true);
    expect(fixtures[0]).not.toHaveProperty("pulse_id");
    expect(fixtures[0].stats.find((s) => s.identifier === "goals_scored")!.a).toEqual([{ value: 2, element: 379 }]);

    const dream = dreamTeamSchema.parse(loadRecapRaw("dream-team-3.json"));
    expect(dream.team).toHaveLength(11);
    expect(dream.top_player).toEqual({ id: 204, points: 15 });

    expect(eventStatusSchema.parse(loadRecapRaw("event-status.json")).status.length).toBeGreaterThan(0);
  });

  it("reject a live response with a renamed field", () => {
    const raw = loadRecapRaw("live-3.json") as { elements: { stats: Record<string, unknown> }[] };
    raw.elements[0].stats.points = raw.elements[0].stats.total_points;
    delete raw.elements[0].stats.total_points;
    expect(eventLiveSchema.safeParse(raw).success).toBe(false);
  });

  it("accept an unplayed gameweek's empty live response", () => {
    expect(eventLiveSchema.parse({ elements: [] })).toEqual({ elements: [] });
  });
});

describe("gameweek client", () => {
  it("fetches the four endpoints with trailing slashes", async () => {
    const { client, fetchMock } = recordedClient();
    const sources = await fetchGameweekSources(client, 3);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).sort()).toEqual([
      "https://fpl.test/api/dream-team/3/",
      "https://fpl.test/api/event-status/",
      "https://fpl.test/api/event/3/live/",
      "https://fpl.test/api/fixtures/?event=3",
    ]);
    expect(sources.live.elements.length).toBeGreaterThan(300);
    expect(sources.fixtures).toHaveLength(10);
    expect(sources.dreamTeam.team).toHaveLength(11);
    expect(sources.eventStatus?.status[0]).toHaveProperty("bonus_added");
  });

  it("rejects an invalid gameweek without calling FPL", async () => {
    const { client, fetchMock } = recordedClient();
    await expect(client.getEventLive(0)).rejects.toThrow("Invalid gameweek: 0");
    await expect(client.getDreamTeam(39)).rejects.toThrow("Invalid gameweek: 39");
    await expect(client.getGameweekFixtures(1.5)).rejects.toThrow("Invalid gameweek");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails on FPL's 404 for an unplayed gameweek's dream team", async () => {
    const { client } = recordedClient();
    await expect(client.getDreamTeam(30)).rejects.toBeInstanceOf(FplRequestError);
  });

  it("fails validation when FPL changes a response's shape", async () => {
    const { client } = recordedClient({ "event-status/": () => json({ status: "updating" }) });
    await expect(client.getEventStatus()).rejects.toBeInstanceOf(FplValidationError);
  });
});

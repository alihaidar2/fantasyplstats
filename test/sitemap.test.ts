import { describe, expect, it } from "vitest";
import { settledGameweeks } from "../src/lib/fpl";
import { PATHS } from "../src/lib/site";
import { buildRobots, buildSitemap, SITEMAP_URL } from "../src/lib/sitemap";
import { matchPageIds, startedGameweeks } from "../src/lib/stats/matches";
import { buildClubs } from "../src/lib/stats/teams";
import { buildFixtureSnapshot } from "./fixture-client";
import { loadBootstrap } from "./helpers";

const SITE = "https://fantasyplstats.com";
const NOW = new Date("2026-11-21T12:00:00Z");

describe("sitemap", () => {
  it("lists the fixed pages, every club, gameweek, match and player once", async () => {
    const { snapshot } = await buildFixtureSnapshot(NOW);
    const urls = buildSitemap(snapshot).map((e) => e.url);
    const players = snapshot.bootstrap.elements;
    expect(players.length).toBeGreaterThan(loadBootstrap().elements.length);

    expect(urls.slice(0, 4)).toEqual([`${SITE}/`, `${SITE}/fixtures/`, `${SITE}/players/`, `${SITE}/teams/`]);
    for (const path of Object.values(PATHS).filter((p) => p !== PATHS.recaps)) {
      expect(urls, path).toContain(`${SITE}${path}`);
    }
    const clubs = buildClubs(snapshot.bootstrap.teams);
    const gameweeks = startedGameweeks(snapshot.bootstrap.events, snapshot.fixtures);
    const matches = matchPageIds(snapshot);
    expect(clubs).toHaveLength(20);
    expect(gameweeks.length).toBeGreaterThan(0);
    expect(matches.length).toBeGreaterThan(0);
    for (const club of clubs) expect(urls).toContain(`${SITE}${club.path}`);
    for (const gw of gameweeks) expect(urls).toContain(`${SITE}/gameweeks/${gw}/`);
    for (const id of matches) expect(urls).toContain(`${SITE}/matches/${id}/`);
    expect(urls).not.toContain(`${SITE}/tools/data.json`);

    const fixed = Object.keys(PATHS).length - 1; // the recap archive is listed only once there is a recap
    expect(urls).toHaveLength(fixed + clubs.length + gameweeks.length + matches.length + players.length);
    for (const p of players) {
      expect(urls.filter((u) => u === `${SITE}/players/${p.id}/`), `player ${p.id}`).toHaveLength(1);
    }
  });

  it("dates settled gameweeks' pages from the next deadline", async () => {
    const { snapshot } = await buildFixtureSnapshot(NOW);
    const byUrl = new Map(buildSitemap(snapshot).map((e) => [e.url, e]));
    const settled = settledGameweeks(snapshot.bootstrap.events);
    expect(settled.length).toBeGreaterThan(0);
    for (const gw of settled) {
      const next = snapshot.bootstrap.events.find((e) => e.id === gw + 1)!.deadline_time!;
      const entry = byUrl.get(`${SITE}/gameweeks/${gw}/`)!;
      expect(entry.lastModified).toBe(new Date(next).toISOString());
      expect(entry.changeFrequency).toBe("monthly");
      const match = snapshot.fixtures.find((f) => f.event === gw)!;
      expect(byUrl.get(`${SITE}/matches/${match.id}/`)?.lastModified).toBe(entry.lastModified);
    }
    const current = snapshot.bootstrap.events.find((e) => e.is_current)!.id;
    expect(byUrl.get(`${SITE}/gameweeks/${current}/`)?.lastModified).toBe(NOW.toISOString());
  });

  it("uses unique absolute URLs on the site that end in a slash", async () => {
    const { snapshot } = await buildFixtureSnapshot(NOW);
    const urls = buildSitemap(snapshot).map((e) => e.url);

    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      const parsed = new URL(url);
      expect(parsed.origin, url).toBe(SITE);
      expect(url, url).toMatch(/\/$/);
      expect(parsed.search + parsed.hash, url).toBe("");
    }
  });

  it("dates every entry no later than the snapshot", async () => {
    const { snapshot } = await buildFixtureSnapshot(NOW);
    for (const entry of buildSitemap(snapshot)) {
      expect(Date.parse(String(entry.lastModified))).toBeLessThanOrEqual(NOW.getTime());
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });
});

describe("robots", () => {
  it("allows everything and points at the sitemap", () => {
    const robots = buildRobots();
    expect(SITEMAP_URL).toBe(`${SITE}/sitemap.xml`);
    expect(robots.sitemap).toBe(SITEMAP_URL);
    expect(robots.host).toBe(SITE);
    expect(robots.rules).toEqual({ userAgent: "*", allow: "/" });
  });
});

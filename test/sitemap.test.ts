import { describe, expect, it } from "vitest";
import { buildRobots, buildSitemap, SITEMAP_URL } from "../src/lib/sitemap";
import { buildFixtureSnapshot } from "./fixture-client";
import { loadBootstrap } from "./helpers";

const SITE = "https://fantasyplstats.com";
const NOW = new Date("2026-11-21T12:00:00Z");

describe("sitemap", () => {
  it("lists the home, fixtures and players pages and every player once", async () => {
    const { snapshot } = await buildFixtureSnapshot(NOW);
    const urls = buildSitemap(snapshot).map((e) => e.url);
    const players = snapshot.bootstrap.elements;
    expect(players.length).toBeGreaterThan(loadBootstrap().elements.length);

    expect(urls.slice(0, 3)).toEqual([`${SITE}/`, `${SITE}/fixtures/`, `${SITE}/players/`]);
    expect(urls).toHaveLength(3 + players.length);
    for (const p of players) {
      expect(urls.filter((u) => u === `${SITE}/players/${p.id}/`), `player ${p.id}`).toHaveLength(1);
    }
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

  it("dates every entry from the snapshot", async () => {
    const { snapshot } = await buildFixtureSnapshot(NOW);
    for (const entry of buildSitemap(snapshot)) {
      expect(entry.lastModified).toBe(NOW.toISOString());
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

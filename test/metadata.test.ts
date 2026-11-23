import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import { buildPlayerDetail, type PlayerDetail } from "../src/lib/fpl";
import {
  fixturesMetadata,
  homeMetadata,
  notFoundMetadata,
  playerMetadata,
  playersMetadata,
  rootMetadata,
} from "../src/lib/metadata";
import { FOOTER_DISCLAIMER, PATHS, playerPath, SITE_DESCRIPTION, SITE_OG_IMAGE, SITE_URL } from "../src/lib/site";
import { loadBootstrap, loadSummary } from "./helpers";

const bootstrap = loadBootstrap();

function player(id: number): PlayerDetail {
  const element = bootstrap.elements.find((e) => e.id === id);
  if (!element) throw new Error(`no player ${id} in the fixture`);
  return buildPlayerDetail(bootstrap, element, id === 1 || id === 430 ? loadSummary(id) : undefined);
}

const canonical = (m: Metadata) => m.alternates?.canonical as string;
const titleText = (m: Metadata) => {
  const t = m.title;
  if (typeof t === "string") return t;
  if (t && "absolute" in t) return t.absolute;
  throw new Error("expected a string or absolute title");
};
const ogUrl = (m: Metadata) => (m.openGraph as { url?: string } | undefined)?.url;

const pages: [string, Metadata, string][] = [
  ["home", homeMetadata, PATHS.home],
  ["fixtures", fixturesMetadata, PATHS.fixtures],
  ["players", playersMetadata, PATHS.players],
  ...bootstrap.elements.slice(0, 25).map((e): [string, Metadata, string] => [
    `player ${e.id}`,
    playerMetadata(player(e.id)),
    playerPath(e.id),
  ]),
];

describe("page metadata", () => {
  it.each(pages)("%s has a trailing-slash canonical matching og:url", (_, metadata, path) => {
    const c = canonical(metadata);
    expect(c).toBe(path);
    expect(c.endsWith("/")).toBe(true);
    expect(ogUrl(metadata)).toBe(c);
  });

  it.each(pages)("%s canonical is a relative path that resolves under SITE_URL", (_, metadata) => {
    const c = canonical(metadata);
    expect(c.startsWith("/")).toBe(true);
    expect(c).not.toMatch(/^\/\//);
    const base = rootMetadata.metadataBase as URL;
    expect(base.toString()).toBe(new URL(SITE_URL).toString());
    const resolved = new URL(c, base);
    expect(resolved.origin).toBe(new URL(SITE_URL).origin);
    expect(resolved.pathname).toBe(c);
  });

  it.each(pages)("%s has its own title and description, and the site share image", (_, metadata) => {
    expect(titleText(metadata)?.length).toBeGreaterThan(0);
    expect(typeof metadata.description).toBe("string");
    expect(metadata.description!.length).toBeGreaterThan(50);
    expect(metadata.openGraph).toMatchObject({ siteName: "FPL Stats", locale: "en_GB" });
    // A page's openGraph replaces the inherited one, so each page must carry the image itself.
    expect(metadata.openGraph).toMatchObject({ images: [SITE_OG_IMAGE] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: [SITE_OG_IMAGE] });
  });

  it("gives every page a distinct title and description", () => {
    expect(new Set(pages.map(([, m]) => titleText(m))).size).toBe(pages.length);
    expect(new Set(pages.map(([, m]) => m.description)).size).toBe(pages.length);
  });
});

describe("player metadata", () => {
  it("names the player, team and position in the title and description", () => {
    const p = player(1);
    const m = playerMetadata(p);
    for (const text of [titleText(m), m.description as string]) {
      expect(text).toContain(p.name);
      expect(text).toContain(p.teamName);
      expect(text.toLowerCase()).toContain(p.position.toLowerCase());
    }
    expect(titleText(m)).toBe(`${p.name} (${p.teamName}, ${p.position}): FPL stats, price and form`);
  });

  it("uses the full name, not FPL's short table name", () => {
    const m = playerMetadata(player(1));
    expect(titleText(m)).toMatch(/^David Raya Martín /);
    expect(m.description).toContain("David Raya Martín");
    expect(JSON.stringify(m.openGraph)).toContain("David Raya Martín");
  });

  it("includes price and total points in the description", () => {
    const p = player(430);
    const d = playerMetadata(p).description as string;
    expect(d).toContain(`£${p.price.toFixed(1)}m`);
    expect(d).toContain(`${p.stats.total_points} points`);
  });

  it("drops the placeholder for an unknown team or position", () => {
    const p = { ...player(1), teamName: "—", position: "—" };
    const m = playerMetadata(p);
    expect(titleText(m)).toBe(`${p.name}: FPL stats, price and form`);
    expect(m.description).not.toContain("—");
  });

  it("uses a profile Open Graph type with the shared site fields", () => {
    expect(playerMetadata(player(1)).openGraph).toMatchObject({
      type: "profile",
      siteName: "FPL Stats",
      locale: "en_GB",
      url: playerPath(1),
    });
  });
});

describe("layout and not-found metadata", () => {
  it("sets the site defaults, with the share image and no canonical", () => {
    expect(rootMetadata.title).toMatchObject({ template: "%s | FPL Stats" });
    expect(rootMetadata.alternates).toBeUndefined();
    expect(rootMetadata.openGraph).toMatchObject({ type: "website", siteName: "FPL Stats", locale: "en_GB" });
    expect(rootMetadata.openGraph).toMatchObject({ images: [SITE_OG_IMAGE] });
    expect(rootMetadata.openGraph).not.toHaveProperty("url");
    expect(rootMetadata.twitter).toEqual({ card: "summary_large_image", images: [SITE_OG_IMAGE] });
  });

  it("gives the 404 page no canonical", () => {
    expect(notFoundMetadata.alternates).toBeUndefined();
    expect(notFoundMetadata.openGraph).toBeUndefined();
  });
});

describe("site wording", () => {
  // The FPL API is unofficial and "FPL" is a trademark: never claim official data.
  it("describes the data as Fantasy Premier League's public data, not official", () => {
    expect(SITE_DESCRIPTION).toContain("rebuilt from Fantasy Premier League's public data");
    expect(SITE_DESCRIPTION).not.toMatch(/official/i);
    expect(rootMetadata.description).toBe(SITE_DESCRIPTION);
    expect(rootMetadata.openGraph?.description).toBe(SITE_DESCRIPTION);
  });

  it("has the unofficial fan site disclaimer for the footer", () => {
    expect(FOOTER_DISCLAIMER).toBe(
      "Unofficial fan site, not affiliated with the Premier League or Fantasy Premier League.",
    );
  });
});

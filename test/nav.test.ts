import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildNav, currentHref, navState, normalisePath, NOT_FOUND_SEGMENT, sectionOf } from "../src/lib/nav";

const APP = join(__dirname, "..", "src", "app");

/** Whether a fixed path like /players/value/ has a page.tsx under src/app. */
const hasPage = (path: string) => {
  try {
    return statSync(join(APP, ...path.split("/").filter(Boolean), "page.tsx")).isFile();
  } catch {
    return false;
  }
};

describe("main navigation", () => {
  const nav = buildNav({ latest: 11, teamOfTheWeek: 10, recaps: true });

  it("has six sections, with every link pointing at a page that exists", () => {
    expect(nav.map((s) => s.label)).toEqual(["Fixtures", "Players", "Teams", "Gameweeks", "Tools", "Recap"]);
    for (const link of nav.flatMap((s) => s.links)) {
      const path = link.href.split("#")[0];
      if (path.startsWith("/gameweeks/1")) {
        expect(statSync(join(APP, "gameweeks", "[gw]", "page.tsx")).isFile()).toBe(true);
      } else {
        expect(hasPage(path), link.href).toBe(true);
      }
      expect(path.endsWith("/"), link.href).toBe(true);
    }
  });

  it("links the latest gameweek and the latest team of the week", () => {
    const hrefs = nav.find((s) => s.id === "gameweeks")!.links.map((l) => l.href);
    expect(hrefs).toContain("/gameweeks/11/");
    expect(hrefs).toContain("/gameweeks/10/#team-of-the-week");
  });

  it("leaves the gameweek links out before the season starts", () => {
    const pre = buildNav({ latest: null, teamOfTheWeek: null, recaps: true });
    const hrefs = pre.find((s) => s.id === "gameweeks")!.links.map((l) => l.href);
    expect(hrefs).toEqual(["/live/", "/gameweeks/", "/points/"]);
  });

  it("covers every top-level route folder in src/app", () => {
    const routes = readdirSync(APP).filter((f) => statSync(join(APP, f)).isDirectory() && !f.startsWith("_"));
    const unlisted = routes.filter((r) => !sectionOf(`/${r}/`) && !["health.json", "opengraph-image"].includes(r));
    expect(unlisted).toEqual([]);
  });

  it("puts each page in its section", () => {
    expect(sectionOf("/")).toBeNull();
    expect(sectionOf("/fixtures/schedule")).toBe("fixtures");
    expect(sectionOf("/players/123/")).toBe("players");
    expect(sectionOf("/players/value/")).toBe("players");
    expect(sectionOf("/teams/arsenal/")).toBe("teams");
    expect(sectionOf("/matches/45/")).toBe("gameweeks");
    expect(sectionOf("/live/")).toBe("gameweeks");
    expect(sectionOf("/points/")).toBe("gameweeks");
    expect(sectionOf("/tools/compare/")).toBe("tools");
    expect(sectionOf("/recap/2026-27/gw4/")).toBe("recap");
  });

  it("marks only exact pages as current", () => {
    expect(normalisePath("/players")).toBe("/players/");
    expect(currentHref(nav, "/players")).toBe("/players/");
    expect(currentHref(nav, "/players/123/")).toBeNull();
    // The results link comes before the team of the week when both point at the same page.
    const same = buildNav({ latest: 10, teamOfTheWeek: 10, recaps: true });
    expect(currentHref(same, "/gameweeks/10/")).toBe("/gameweeks/10/");
    expect(currentHref(nav, "/gameweeks/10/")).toBe("/gameweeks/10/#team-of-the-week");
  });
});

describe("section links and the not-found page", () => {
  const nav = buildNav({ latest: 11, teamOfTheWeek: 10, recaps: true });

  it("gives every section a main page that exists and is one of its links", () => {
    for (const section of nav) {
      expect(hasPage(section.href), section.id).toBe(true);
      expect(section.links.map((l) => l.href), section.id).toContain(section.href);
    }
    expect(nav.map((s) => s.href)).toEqual(["/fixtures/", "/players/", "/teams/", "/gameweeks/", "/tools/", "/recap/"]);
  });

  it("leaves the Recap item out until a recap is published", () => {
    const none = buildNav({ latest: 11, teamOfTheWeek: 10, recaps: false });
    expect(none.map((s) => s.id)).toEqual(["fixtures", "players", "teams", "gameweeks", "tools"]);
  });

  it("marks no section or page as current on the not-found page, whatever URL was asked for", () => {
    expect(navState(nav, "/players/", "players")).toEqual({ active: "players", current: "/players/" });
    expect(navState(nav, "/players/", NOT_FOUND_SEGMENT)).toEqual({ active: null, current: null });
    expect(navState(nav, "/tools/compare/", NOT_FOUND_SEGMENT)).toEqual({ active: null, current: null });
  });
});

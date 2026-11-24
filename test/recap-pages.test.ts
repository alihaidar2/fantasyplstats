import { describe, expect, it } from "vitest";
import { parseSnapshot, type Snapshot } from "../src/lib/fpl";
import { recapArchiveMetadata, recapMetadata, truncateDescription } from "../src/lib/metadata";
import type { CardRecap } from "../src/lib/recap/recap";
import {
  authorshipNote,
  buildGameweekStats,
  buildRecapArchive,
  buildRecapEntities,
  buildRecapPage,
  RECAP_PLACEHOLDER_PARAMS,
  recapParams,
} from "../src/lib/recap-pages";
import { compareNewestFirst, parseGameweekParam, toPublishedRecap, type PublishedRecap } from "../src/lib/recaps";
import { buildSitemap } from "../src/lib/sitemap";
import { loadRecapRaw } from "./recap/helpers";

/** The recorded 2026/27 snapshot (GW4 current), which has the players the sample recap names. */
const loadSnapshot = (): Snapshot => parseSnapshot(loadRecapRaw("snapshot.json"));
const sample = () => loadRecapRaw("sample-recap.json") as CardRecap;
const published = (season: string, gameweek: number, extra: Partial<CardRecap> = {}): PublishedRecap =>
  toPublishedRecap({ ...sample(), season, gameweek, headline: `${season} GW${gameweek}`, ...extra });

describe("buildGameweekStats", () => {
  it("reads the gameweek's numbers from the snapshot's events", () => {
    const stats = buildGameweekStats(loadSnapshot(), "2026-27", 4);
    expect(stats).toEqual({
      gameweek: 4,
      averageScore: 69,
      highestScore: 151,
      mostCaptained: { id: 411, name: "Haaland", team: "MCI", path: "/players/411/" },
      topScorer: { id: 124, name: "Groß", team: "BHA", path: "/players/124/", points: 17 },
      chips: [
        { chip: "wildcard", label: "Wildcard", played: 760682 },
        { chip: "freehit", label: "Free Hit", played: 328740 },
        { chip: "3xc", label: "Triple Captain", played: 323226 },
        { chip: "bboost", label: "Bench Boost", played: 170070 },
      ],
    });
  });

  it("has nothing for a recap from another season, whose gameweek the snapshot doesn't describe", () => {
    expect(buildGameweekStats(loadSnapshot(), "2025-26", 4)).toBeNull();
  });

  it("has nothing for a gameweek that isn't in the snapshot or hasn't been played", () => {
    const snapshot = loadSnapshot();
    expect(buildGameweekStats(snapshot, "2026-27", 30)).toBeNull();
    const gw6 = snapshot.bootstrap.events.find((e) => e.id === 6)!;
    Object.assign(gw6, {
      finished: false,
      data_checked: false,
      average_entry_score: 0,
      highest_score: null,
      top_element_info: null,
      most_captained: null,
      chip_plays: [],
    });
    expect(buildGameweekStats(snapshot, "2026-27", 6)).toBeNull();
  });

  it("leaves out players the snapshot no longer lists rather than naming them wrongly", () => {
    const snapshot = loadSnapshot();
    snapshot.bootstrap.elements = snapshot.bootstrap.elements.filter((e) => e.id !== 411 && e.id !== 124);
    const stats = buildGameweekStats(snapshot, "2026-27", 4)!;
    expect(stats.mostCaptained).toBeNull();
    expect(stats.topScorer).toBeNull();
    expect(stats.averageScore).toBe(69);
  });

  it("keeps an unknown chip's id as its label", () => {
    const snapshot = loadSnapshot();
    snapshot.bootstrap.events.find((e) => e.id === 4)!.chip_plays = [{ chip_name: "newchip", num_played: 5 }];
    expect(buildGameweekStats(snapshot, "2026-27", 4)!.chips).toEqual([{ chip: "newchip", label: "newchip", played: 5 }]);
  });
});

describe("buildRecapEntities", () => {
  it("links and badges every player and club the cards name, from the snapshot", () => {
    const entities = buildRecapEntities(loadSnapshot(), toPublishedRecap(sample()));
    expect(entities.players.p411).toEqual({ path: "/players/411/", team: "MCI", badge: 43 });
    expect(entities.players.p94).toMatchObject({ path: "/players/94/", team: "BRE" });
    // Every ref on the sample's cards.
    expect(Object.keys(entities.players).sort()).toEqual(
      ["p1", "p165", "p286", "p330", "p40", "p411", "p426", "p8", "p94"].sort(),
    );
    expect(entities.clubs["Coventry City"]).toMatchObject({ short: expect.any(String), badge: expect.any(Number) });
    expect(Object.keys(entities.clubs).sort()).toEqual(["Brighton", "Coventry City", "Leeds", "Newcastle"]);
  });

  it("has none for a recap from another season, whose ids the snapshot doesn't describe", () => {
    expect(buildRecapEntities(loadSnapshot(), toPublishedRecap({ ...sample(), season: "2025-26" }))).toEqual({ players: {}, clubs: {} });
  });
});

describe("buildRecapPage", () => {
  const recaps = [published("2026-27", 5), published("2026-27", 4), published("2025-26", 38)].sort(compareNewestFirst);

  it("has the recap, its stats, the note and links either side", () => {
    const page = buildRecapPage(loadSnapshot(), recaps, "2026-27", 4)!;
    expect(page.recap.path).toBe("/recap/2026-27/gw4/");
    expect(page.seasonLabel).toBe("2026/27");
    expect(page.stats?.gameweek).toBe(4);
    expect(page.previous).toEqual({ path: "/recap/2025-26/gw38/", label: "2025/26 GW38", headline: "2025-26 GW38" });
    expect(page.next).toEqual({ path: "/recap/2026-27/gw5/", label: "GW5", headline: "2026-27 GW5" });
  });

  it("has no stats box for an older season's recap", () => {
    const page = buildRecapPage(loadSnapshot(), recaps, "2025-26", 38)!;
    expect(page.stats).toBeNull();
    expect(page.previous).toBeNull();
    expect(page.next?.label).toBe("2026/27 GW4");
  });

  it("is null for a recap that doesn't exist", () => {
    expect(buildRecapPage(loadSnapshot(), recaps, "2026-27", 3)).toBeNull();
    expect(buildRecapPage(loadSnapshot(), [], "2026-27", 4)).toBeNull();
  });

  it("says an AI model wrote it, naming the model, or that a person did", () => {
    const ai = authorshipNote("claude-sonnet-4-5");
    expect(ai).toMatch(/^Written by AI \(claude-sonnet-4-5\) from verified Fantasy Premier League data\./);
    expect(ai).toMatch(/Every number was checked automatically/);
    expect(ai).toMatch(/a person reviewed the recap before it was published/);
    expect(authorshipNote("hand-written")).toMatch(/^Written by hand/);
    const page = buildRecapPage(loadSnapshot(), [published("2026-27", 4, { model: "claude-haiku-4-5" })], "2026-27", 4)!;
    expect(page.note).toContain("(claude-haiku-4-5)");
  });
});

describe("recap routes", () => {
  it("has a param per recap, which parses back to its gameweek", () => {
    const params = recapParams([published("2026-27", 12), published("2025-26", 38)]);
    expect(params).toEqual([
      { season: "2026-27", gameweek: "gw12" },
      { season: "2025-26", gameweek: "gw38" },
    ]);
    expect(params.map((p) => parseGameweekParam(p.gameweek))).toEqual([12, 38]);
  });

  it("uses a placeholder that can never match a recap", () => {
    expect(parseGameweekParam(RECAP_PLACEHOLDER_PARAMS.gameweek)).toBeNull();
  });
});

describe("buildRecapArchive", () => {
  it("groups newest-first recaps by season", () => {
    const recaps = [published("2025-26", 37), published("2026-27", 2), published("2025-26", 38), published("2026-27", 1)].sort(
      compareNewestFirst,
    );
    expect(buildRecapArchive(recaps)).toEqual([
      {
        season: "2026-27",
        label: "2026/27",
        recaps: [
          { path: "/recap/2026-27/gw2/", gameweek: 2, headline: "2026-27 GW2" },
          { path: "/recap/2026-27/gw1/", gameweek: 1, headline: "2026-27 GW1" },
        ],
      },
      {
        season: "2025-26",
        label: "2025/26",
        recaps: [
          { path: "/recap/2025-26/gw38/", gameweek: 38, headline: "2025-26 GW38" },
          { path: "/recap/2025-26/gw37/", gameweek: 37, headline: "2025-26 GW37" },
        ],
      },
    ]);
  });

  it("is empty with no recaps", () => {
    expect(buildRecapArchive([])).toEqual([]);
  });
});

describe("recap metadata", () => {
  it("titles the page with the gameweek and headline, with a canonical and a short description", () => {
    const recap = toPublishedRecap(sample());
    const metadata = recapMetadata(recap);
    expect(metadata.title).toBe(`GW4 recap: ${recap.headline}`);
    expect(metadata.alternates?.canonical).toBe("/recap/2026-27/gw4/");
    expect(String(metadata.description)).toMatch(/^Fantasy Premier League 2026\/27 Gameweek 4 recap\. A steady return from the armband, but Raya was the better pick/);
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
    expect(metadata.openGraph).toMatchObject({ type: "article", url: "/recap/2026-27/gw4/", description: metadata.description });
  });

  it("keeps the archive out of search results until there's a recap", () => {
    expect(recapArchiveMetadata(0).robots).toEqual({ index: false });
    expect(recapArchiveMetadata(1).robots).toBeUndefined();
    expect(recapArchiveMetadata(1).alternates?.canonical).toBe("/recap/");
  });

  it("truncates descriptions at a word", () => {
    expect(truncateDescription("short text")).toBe("short text");
    const long = truncateDescription("word ".repeat(60), 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long).toMatch(/word…$/);
  });
});

describe("sitemap with recaps", () => {
  const snapshot = loadSnapshot();

  it("lists the archive and every recap, dated from the recaps", () => {
    const recaps = [published("2026-27", 5, { generatedAt: "2026-12-01T10:00:00.000Z" }), published("2026-27", 4)];
    const entries = buildSitemap(snapshot, recaps);
    const byUrl = new Map(entries.map((e) => [e.url, e]));

    expect(byUrl.get("https://fantasyplstats.com/recap/")?.lastModified).toBe("2026-12-01T10:00:00.000Z");
    expect(byUrl.get("https://fantasyplstats.com/recap/2026-27/gw5/")?.lastModified).toBe("2026-12-01T10:00:00.000Z");
    expect(byUrl.get("https://fantasyplstats.com/recap/2026-27/gw4/")?.lastModified).toBe(sample().generatedAt);
    expect(entries).toHaveLength(buildSitemap(snapshot).length + 1 + 2);
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length);
  });

  it("leaves recaps and the empty archive out when there are none", () => {
    const urls = buildSitemap(snapshot).map((e) => e.url);
    expect(urls.filter((u) => u.includes("/recap/"))).toEqual([]);
    expect(buildSitemap(snapshot, [])).toEqual(buildSitemap(snapshot));
  });
});

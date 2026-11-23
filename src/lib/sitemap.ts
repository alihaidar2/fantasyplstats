// Pure builders for sitemap.xml and robots.txt (src/app/sitemap.ts and
// src/app/robots.ts call them). Relative imports, not `@/`, so the Vitest
// tests can import this file without the Next.js path alias.

import type { MetadataRoute } from "next";
import { settledGameweeks, type Snapshot } from "./fpl";
import type { PublishedRecap } from "./recaps";
import { absoluteUrl, gameweekPath, matchPath, PATHS, playerPath, SITE_URL } from "./site";
import { hasMatchPage, startedGameweeks } from "./stats/matches/shared";
import { buildClubs } from "./stats/teams";

export const SITEMAP_URL = absoluteUrl("/sitemap.xml");

type Entry = MetadataRoute.Sitemap[number];
type ChangeFrequency = NonNullable<Entry["changeFrequency"]>;

/** The site's fixed pages: path, priority and how often each changes. */
const FIXED_PAGES: readonly [path: string, priority: number, changeFrequency: ChangeFrequency][] = [
  [PATHS.home, 1, "daily"],
  [PATHS.fixtures, 0.9, "daily"],
  [PATHS.players, 0.9, "daily"],
  [PATHS.teams, 0.9, "daily"],
  [PATHS.live, 0.8, "hourly"],
  [PATHS.gameweeks, 0.8, "daily"],
  [PATHS.schedule, 0.8, "daily"],
  [PATHS.availability, 0.8, "daily"],
  [PATHS.prices, 0.8, "daily"],
  [PATHS.template, 0.8, "daily"],
  [PATHS.planner, 0.8, "daily"],
  [PATHS.value, 0.7, "daily"],
  [PATHS.setPieces, 0.7, "daily"],
  [PATHS.compare, 0.7, "daily"],
  [PATHS.tools, 0.6, "weekly"],
  [PATHS.points, 0.5, "weekly"],
];

/**
 * When a settled gameweek's pages last changed: FPL settles a gameweek before
 * the next deadline, so that deadline (or the snapshot time, if it is still
 * ahead or there is no next gameweek). Pages of unsettled gameweeks change
 * with every build, so they carry the snapshot time.
 */
function gameweekDates(snapshot: Pick<Snapshot, "generatedAt" | "bootstrap">) {
  const { events } = snapshot.bootstrap;
  const settled = new Set(settledGameweeks(events));
  const dates = new Map<number, string>();
  for (const event of events) {
    if (!settled.has(event.id)) continue;
    const next = events.find((e) => e.id === event.id + 1)?.deadline_time;
    const nextTime = next ? Date.parse(next) : NaN;
    dates.set(
      event.id,
      Number.isFinite(nextTime) && nextTime <= Date.parse(snapshot.generatedAt)
        ? new Date(nextTime).toISOString()
        : snapshot.generatedAt,
    );
  }
  return dates;
}

/**
 * Every page on the site, as absolute URLs ending in "/" (trailingSlash: true).
 * Pages built from the snapshot share its timestamp, except gameweek and match
 * pages of settled gameweeks (see gameweekDates). Recap pages don't change
 * once published, so each is dated from its recap; the archive is listed only
 * once there is a recap (until then it is an empty, noindex page).
 */
export function buildSitemap(
  snapshot: Pick<Snapshot, "generatedAt" | "bootstrap" | "fixtures">,
  recaps: readonly Pick<PublishedRecap, "path" | "generatedAt">[] = [],
): MetadataRoute.Sitemap {
  const lastModified = snapshot.generatedAt;
  const ids = [...new Set(snapshot.bootstrap.elements.map((e) => e.id))].sort((a, b) => a - b);
  const newestRecap = recaps.map((r) => r.generatedAt).sort().at(-1);
  const settledDates = gameweekDates(snapshot);
  const gameweekEntry = (gameweek: number | null, url: string, priority: number): Entry => {
    const settled = gameweek !== null ? settledDates.get(gameweek) : undefined;
    return settled
      ? { url, lastModified: settled, changeFrequency: "monthly", priority }
      : { url, lastModified, changeFrequency: "daily", priority };
  };

  return [
    ...FIXED_PAGES.map(([path, priority, changeFrequency]) => ({
      url: absoluteUrl(path),
      lastModified,
      changeFrequency,
      priority,
    })),
    ...(newestRecap
      ? [{ url: absoluteUrl(PATHS.recaps), lastModified: newestRecap, changeFrequency: "weekly" as const, priority: 0.8 }]
      : []),
    ...recaps.map((r) => ({
      url: absoluteUrl(r.path),
      lastModified: r.generatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    ...buildClubs(snapshot.bootstrap.teams).map((club) => ({
      url: absoluteUrl(club.path),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...startedGameweeks(snapshot.bootstrap.events, snapshot.fixtures).map((gw) =>
      gameweekEntry(gw, absoluteUrl(gameweekPath(gw)), 0.6),
    ),
    ...snapshot.fixtures
      .filter(hasMatchPage)
      .sort((a, b) => a.id - b.id)
      .map((f) => gameweekEntry(f.event, absoluteUrl(matchPath(f.id)), 0.5)),
    ...ids.map((id) => ({
      url: absoluteUrl(playerPath(id)),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}

/** Crawl everything and point crawlers at the sitemap. */
export function buildRobots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: SITEMAP_URL,
    host: SITE_URL,
  };
}

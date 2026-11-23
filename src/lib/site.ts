// Site-wide constants for metadata, the sitemap, robots.txt and OG images.
// Paths end with "/" because next.config.ts sets trailingSlash: true, so these
// match the URLs the static site actually serves (players/1/index.html).

export const SITE_URL = "https://fantasyplstats.com";
export const SITE_NAME = "FPL Stats";
export const SITE_DESCRIPTION =
  "Fantasy Premier League fixture difficulty, player stats and form, rebuilt from Fantasy Premier League's public data through the day.";

/** Shown in every page's footer. The FPL API is unofficial and the names are trademarks. */
export const FOOTER_DISCLAIMER =
  "Unofficial fan site, not affiliated with the Premier League or Fantasy Premier League.";

/** Every fixed page on the site. The feature areas' own path constants point here. */
export const PATHS = {
  home: "/",
  fixtures: "/fixtures/",
  schedule: "/fixtures/schedule/",
  players: "/players/",
  availability: "/players/availability/",
  prices: "/players/prices/",
  value: "/players/value/",
  setPieces: "/players/set-pieces/",
  template: "/players/template/",
  teams: "/teams/",
  gameweeks: "/gameweeks/",
  live: "/live/",
  points: "/points/",
  tools: "/tools/",
  planner: "/tools/planner/",
  compare: "/tools/compare/",
  recaps: "/recap/",
} as const;

/**
 * The site-wide share image, rendered by src/app/opengraph-image.tsx. Its
 * generateImageMetadata id ("og.png") makes the export write it to
 * out/opengraph-image/og.png. Pages set their own openGraph object, which
 * replaces the one that file would inject, so src/lib/metadata.ts adds this
 * to every page explicitly.
 */
export const SITE_OG_IMAGE = {
  url: "/opengraph-image/og.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${SITE_NAME}: Fantasy Premier League fixture difficulty and player stats`,
} as const;

export const playerPath = (id: number | string) => `/players/${id}/`;

/** A club page: /teams/manchester-city/ (slugs come from src/lib/stats/teams.ts). */
export const teamPath = (slug: string) => `${PATHS.teams}${slug}/`;

/** A gameweek page: /gameweeks/7/. */
export const gameweekPath = (gameweek: number) => `${PATHS.gameweeks}${gameweek}/`;

/** A match page: /matches/123/ (FPL's fixture id, which restarts each season). */
export const matchPath = (fixtureId: number) => `/matches/${fixtureId}/`;

/** The Premier League's badge image for a club's `code` (stable across seasons). */
export const badgeUrl = (code: number) => `https://resources.premierleague.com/premierleague/badges/t${code}.png`;

/** A recap's permanent page: /recap/2026-27/gw4/ (the gameweek is not zero-padded). */
export const recapPath = (season: string, gameweek: number) => `/recap/${season}/gw${gameweek}/`;

/** Absolute URL for a site path. */
export const absoluteUrl = (path: string) => new URL(path, SITE_URL).toString();

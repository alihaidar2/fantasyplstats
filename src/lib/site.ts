// Site-wide constants for metadata, the sitemap, robots.txt and OG images.
// Paths end with "/" because next.config.ts sets trailingSlash: true, so these
// match the URLs the static site actually serves (players/1/index.html).

export const SITE_URL = "https://fantasyplstats.com";
export const SITE_NAME = "FPL Stats";
export const SITE_DESCRIPTION =
  "Fantasy Premier League fixture difficulty, player stats and form, rebuilt from the official FPL data through the day.";

export const PATHS = {
  home: "/",
  fixtures: "/fixtures/",
  players: "/players/",
} as const;

export const playerPath = (id: number | string) => `/players/${id}/`;

/** Absolute URL for a site path. */
export const absoluteUrl = (path: string) => new URL(path, SITE_URL).toString();

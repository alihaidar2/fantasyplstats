// Pure builders for each page's <head> metadata (titles, descriptions,
// canonical URLs, Open Graph). The page files call them; relative imports, not
// `@/`, so the Vitest tests can import this file without the Next.js alias.
//
// Canonicals are relative paths ending in "/" (trailingSlash: true); the root
// layout's metadataBase turns them into absolute URLs under SITE_URL.
//
// Every page carries the site-wide share image (SITE_OG_IMAGE) explicitly: Next
// only injects src/app/opengraph-image.tsx into its own segment, and a child
// page's openGraph object replaces the inherited images.

import type { Metadata } from "next";
import type { PlayerDetail } from "./fpl";
import { formatSeason, type PublishedRecap } from "./recaps";
import { PATHS, playerPath, SITE_DESCRIPTION, SITE_NAME, SITE_OG_IMAGE, SITE_URL } from "./site";

type OpenGraph = NonNullable<Metadata["openGraph"]>;

/** Open Graph fields every page shares. A page's `openGraph` replaces the layout's, so each page spreads these in. */
export const BASE_OPEN_GRAPH = {
  type: "website",
  siteName: SITE_NAME,
  locale: "en_GB",
  images: [SITE_OG_IMAGE],
} as const satisfies OpenGraph;

/** Twitter card fields every page shares. */
export const BASE_TWITTER = {
  card: "summary_large_image",
  images: [SITE_OG_IMAGE],
} as const satisfies NonNullable<Metadata["twitter"]>;

/** Root layout metadata: site-wide defaults, no canonical (so not-found pages get none). */
export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: `%s | ${SITE_NAME}`,
    default: `${SITE_NAME}: Fantasy Premier League fixtures and player stats`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: BASE_TWITTER,
};

interface PageMetadataInput {
  /** Page title. Templated with " | FPL Stats" unless `absoluteTitle` is set. */
  title: string;
  description: string;
  /** Site path ending in "/", e.g. PATHS.fixtures. */
  path: string;
  /** Use the title as is, ignoring the layout's template (needed for app/page.tsx, which shares the layout's segment). */
  absoluteTitle?: boolean;
  openGraph?: Partial<OpenGraph>;
}

/** Title, description, canonical and Open Graph for one indexable page. */
export function pageMetadata({ title, description, path, absoluteTitle, openGraph }: PageMetadataInput): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      ...BASE_OPEN_GRAPH,
      title,
      description,
      url: path,
      ...openGraph,
    } as OpenGraph,
    twitter: { ...BASE_TWITTER, title, description },
  };
}

export const homeMetadata: Metadata = pageMetadata({
  title: `${SITE_NAME}: Fantasy Premier League fixtures and player stats`,
  description:
    "Free Fantasy Premier League tools: a fixture difficulty matrix for every team and stats, prices and form for every FPL player, updated through the day.",
  path: PATHS.home,
  absoluteTitle: true,
});

export const fixturesMetadata: Metadata = pageMetadata({
  title: "FPL fixture difficulty matrix",
  description:
    "Fantasy Premier League fixture difficulty ratings for every Premier League team, gameweek by gameweek, to plan transfers and spot easy runs of fixtures.",
  path: PATHS.fixtures,
});

export const playersMetadata: Metadata = pageMetadata({
  title: "FPL player stats",
  description:
    "Sortable Fantasy Premier League stats for every player: price, total points, form, ownership, goals, assists, expected goals and more.",
  path: PATHS.players,
});

/** "—" is the transforms' placeholder for a missing team or position. */
const known = (value: string) => (value && value !== "—" ? value : null);

/** Metadata for /players/[id]/, built from the player's name, team, position and headline numbers. */
export function playerMetadata(player: PlayerDetail): Metadata {
  const team = known(player.teamName);
  const position = known(player.position);
  const context = [team, position].filter(Boolean).join(", ");
  const title = `${player.name}${context ? ` (${context})` : ""}: FPL stats, price and form`;

  const { total_points, form, selected_by_percent } = player.stats;
  const who = [team, position?.toLowerCase()].filter(Boolean).join(" ");
  const description =
    `${player.name} is a £${player.price.toFixed(1)}m ${who || "player"} in Fantasy Premier League with ` +
    `${total_points} points this season (form ${form}, owned by ${Number(selected_by_percent).toFixed(1)}% of managers). ` +
    "Gameweek points, goals, assists, expected goals and more.";

  return pageMetadata({
    title,
    description,
    path: playerPath(player.id),
    openGraph: { type: "profile" },
  });
}

/** For an unknown player id. dynamicParams = false makes this unreachable in the export, but keep it safe. */
export const playerNotFoundMetadata: Metadata = {
  title: "Player not found",
  robots: { index: false },
};

/** Cuts text to at most `max` characters at a word boundary, adding "…" if it was cut. */
export function truncateDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** Metadata for /recap/<season>/gw<N>/: the headline as the title, the opening as the description. */
export function recapMetadata(recap: PublishedRecap): Metadata {
  return pageMetadata({
    title: `GW${recap.gameweek} recap: ${recap.headline}`,
    description: truncateDescription(
      `Fantasy Premier League ${formatSeason(recap.season)} Gameweek ${recap.gameweek} recap. ${recap.paragraphs[0]}`,
    ),
    path: recap.path,
    openGraph: { type: "article", publishedTime: recap.generatedAt },
  });
}

/** For an unknown recap. dynamicParams = false makes this unreachable in the export, but keep it safe. */
export const recapNotFoundMetadata: Metadata = {
  title: "Recap not found",
  robots: { index: false },
};

/** The archive. Until the first recap is published it is an empty page, so keep it out of search results. */
export function recapArchiveMetadata(recapCount: number): Metadata {
  const metadata = pageMetadata({
    title: "FPL gameweek recaps",
    description:
      "Every Fantasy Premier League gameweek recap on FPL Stats: the week's biggest scores, captains, differentials and talking points, written from verified FPL data.",
    path: PATHS.recaps,
  });
  return recapCount > 0 ? metadata : { ...metadata, robots: { index: false } };
}

/** The 404 page: no canonical. Next adds <meta name="robots" content="noindex"> to not-found pages itself. */
export const notFoundMetadata: Metadata = {
  title: { absolute: `Page not found | ${SITE_NAME}` },
};

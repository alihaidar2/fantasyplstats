// Pure builders for sitemap.xml and robots.txt (src/app/sitemap.ts and
// src/app/robots.ts call them). Relative imports, not `@/`, so the Vitest
// tests can import this file without the Next.js path alias.

import type { MetadataRoute } from "next";
import type { Snapshot } from "./fpl";
import { absoluteUrl, PATHS, playerPath, SITE_URL } from "./site";

export const SITEMAP_URL = absoluteUrl("/sitemap.xml");

/**
 * Every page on the site, as absolute URLs ending in "/" (trailingSlash: true).
 * All pages are rebuilt from the same snapshot, so they share its timestamp.
 */
export function buildSitemap(snapshot: Pick<Snapshot, "generatedAt" | "bootstrap">): MetadataRoute.Sitemap {
  const lastModified = snapshot.generatedAt;
  const ids = [...new Set(snapshot.bootstrap.elements.map((e) => e.id))].sort((a, b) => a - b);

  return [
    { url: absoluteUrl(PATHS.home), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl(PATHS.fixtures), lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl(PATHS.players), lastModified, changeFrequency: "daily", priority: 0.9 },
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

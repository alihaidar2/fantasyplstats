import type { MetadataRoute } from "next";
import { getRecaps, getSnapshot } from "@/lib/data";
import { buildSitemap } from "@/lib/sitemap";

// Prerendered to out/sitemap.xml: a static export only emits route handlers
// marked force-static.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(getSnapshot(), getRecaps());
}

import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/sitemap";

// Prerendered to out/robots.txt: a static export only emits route handlers
// marked force-static.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}

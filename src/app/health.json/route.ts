import { getSnapshot } from "@/lib/data";
import { buildHealth } from "@/lib/fpl";

// Written to out/health.json at build time, so monitoring can check freshness.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildHealth(getSnapshot()));
}

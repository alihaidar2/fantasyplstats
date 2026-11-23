import { getSnapshot } from "@/lib/data";
import { buildToolsData } from "@/lib/stats/tools-data";

// Written to out/tools/data.json at build time: the compact player and fixture
// data the squad planner and player comparison load in the browser.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildToolsData(getSnapshot()));
}

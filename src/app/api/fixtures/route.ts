// import { buildMatrix } from "@/lib/matrix";
import { NextResponse } from "next/server";
import { buildFixtureMatrix } from "@/lib/utils";
import { fplApiService } from "@/services/fpl-api";

export const revalidate = 3600; // 1 hour

export async function GET() {
  try {
    const { bootstrap, fixtures } = await fplApiService.getAllData();

    const matrix = buildFixtureMatrix(bootstrap.teams, fixtures);

    const res = NextResponse.json(matrix);
    res.headers.set("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res;
  } catch (err) {
    console.error("API Error Details:", {
      message: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: "Failed to fetch fixtures",
        details: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { fplApiService } from "@/services/fpl-api";

export const revalidate = 3600; // 1 hour

export async function GET() {
  try {
    const bootstrapData = await fplApiService.getBootstrapData();

    const res = NextResponse.json(bootstrapData);
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
        error: "Failed to fetch players",
        details: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

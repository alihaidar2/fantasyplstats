// app/api/debug/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    COSMOS_DB_ENDPOINT: process.env.COSMOS_DB_ENDPOINT ?? "undefined",
    COSMOS_DB_DATABASE: process.env.COSMOS_DB_DATABASE ?? "undefined",
    hasKey: !!process.env.COSMOS_DB_KEY,
  });
}

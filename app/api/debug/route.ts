// app/api/debug/route.ts
import { getDatabase } from "@/lib/cosmosClient";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDatabase();
  const { resources: containers } = await db!.containers.readAll().fetchAll();

  return NextResponse.json({
    containers: containers.map((c) => c.id),
    COSMOS_DB_ENDPOINT: process.env.COSMOS_DB_ENDPOINT ?? "undefined",
    COSMOS_DB_DATABASE: process.env.COSMOS_DB_DATABASE ?? "undefined",
    hasKey: !!process.env.COSMOS_DB_KEY,
  });

  // return NextResponse.json({
  //   COSMOS_DB_ENDPOINT: process.env.COSMOS_DB_ENDPOINT ?? "undefined",
  //   COSMOS_DB_DATABASE: process.env.COSMOS_DB_DATABASE ?? "undefined",
  //   hasKey: !!process.env.COSMOS_DB_KEY,
  // });
}

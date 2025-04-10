// app/api/debug/route.ts
import { getDatabase } from "@/lib/cosmosClient";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = getDatabase();

    const envVars = {
      COSMOS_DB_ENDPOINT: process.env.COSMOS_DB_ENDPOINT ?? "undefined",
      COSMOS_DB_DATABASE: process.env.COSMOS_DB_DATABASE ?? "undefined",
      COSMOS_DB_KEY: process.env.COSMOS_DB_KEY ? "[REDACTED]" : "undefine",
      NODE_ENV: process.env.NODE_ENV ?? "undefined",
    };

    if (!db) {
      console.error("❌ getDatabase() returned null");
      return NextResponse.json(
        {
          error: "Database not initialized",
          env: envVars,
        },
        { status: 500 }
      );
    }

    const { resources: containers } = await db.containers.readAll().fetchAll();

    return NextResponse.json({
      initialized: true,
      containers: containers.map((c) => c.id),
      env: envVars,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("❌ Error in /api/debug:", err);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: err?.message ?? "Unknown error",
        stack: err?.stack ?? "No stack trace",
        env: {
          COSMOS_DB_ENDPOINT: process.env.COSMOS_DB_ENDPOINT ?? "undefined",
          COSMOS_DB_DATABASE: process.env.COSMOS_DB_DATABASE ?? "undefined",
          COSMOS_DB_KEY: process.env.COSMOS_DB_KEY ? "[REDACTED]" : "undefined",
          NODE_ENV: process.env.NODE_ENV ?? "undefined",
        },
      },
      { status: 500 }
    );
  }
}

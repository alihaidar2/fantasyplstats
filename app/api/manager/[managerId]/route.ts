import { NextRequest, NextResponse } from "next/server";
import database from "@/lib/cosmosClient";

export async function GET(
  req: NextRequest,
  context: { params: { managerId: string } }
) {
  // Check if the database is initialized
  if (!database) {
    return NextResponse.json(
      { error: "Database connection not initialized" },
      { status: 500 }
    );
  }
  if (!context.params.managerId) {
    return NextResponse.json({ error: "Missing manager ID" }, { status: 400 });
  }

  const managerId = context.params.managerId;
  const gameweek = "24"; // ✅ Consider making this dynamic later

  console.log(`Fetching FPL team for managerId: ${managerId}`);

  try {
    // ✅ Step 1: Fetch manager's team from the FPL API
    const fplUrl = `https://fantasy.premierleague.com/api/entry/${managerId}/event/${gameweek}/picks/`;
    const fplResponse = await fetch(fplUrl);

    if (!fplResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch manager's team from FPL API" },
        { status: 500 }
      );
    }

    const fplData = await fplResponse.json();
    const selectedPlayerIds: number[] = fplData.picks.map(
      (pick: { element: number }) => pick.element
    );
    console.log("selectedPlayerIds: ", selectedPlayerIds);

    // ✅ Step 2: Fetch only the manager's players from CosmosDB
    const playersContainer = database.container("players");
    const { resources: managerTeam } = await playersContainer.items
      .query({
        query: `SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.player_id)`,
        parameters: [{ name: "@ids", value: selectedPlayerIds }],
      })
      .fetchAll();

    return NextResponse.json(managerTeam);
  } catch (error) {
    console.error("🚨 Error fetching manager's team:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

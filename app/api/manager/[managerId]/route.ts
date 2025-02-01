import { NextResponse } from "next/server";
import database from "@/lib/cosmosClient";

export async function GET(
  request: Request,
  { params }: { params: { managerId: string } }
) {
  // Check if the database is initialized
  if (!database) {
    return NextResponse.json(
      { error: "Database connection not initialized" },
      { status: 500 }
    );
  }

  const { managerId } = params;
  const gameweek = "24"; // You can make this dynamic later
  console.log("managerId: ", managerId);

  try {
    // Fetch the manager's team from the FPL API
    const fplUrl = `https://fantasy.premierleague.com/api/entry/${managerId}/event/${gameweek}/picks/`;
    const fplResponse = await fetch(fplUrl);
    console.log("fplResponse: ", fplResponse);

    if (!fplResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch manager's team" },
        { status: 500 }
      );
    }

    const fplData = await fplResponse.json();
    const selectedPlayerIds = fplData.picks.map((pick: any) => pick.element);

    // Fetch all players from Cosmos DB
    const playersContainer = database.container("players");
    const { resources: allPlayers } = await playersContainer.items
      .query("SELECT * FROM c")
      .fetchAll();

    // Filter to only include the manager's selected players
    const managerTeam = allPlayers.filter((player) =>
      selectedPlayerIds.includes(player.player_id)
    );

    return NextResponse.json(managerTeam);
  } catch (error) {
    console.error("Error fetching manager's team:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

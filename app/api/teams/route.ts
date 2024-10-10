import { NextResponse } from "next/server";

const dbClient = require("../../../scripts/astraClient");

export async function GET() {
  try {
    console.log("Fetching teams from the database...");
    const teamsCollection = dbClient.collection("teams");
    const teamsCursor = await teamsCollection.find({});
    const teams = await teamsCursor.toArray(); // Convert cursor to array
    console.log("Raw teams data:", teams);

    const formattedTeams = teams.map((team: any, index: any) => ({
      id: index, // Ensure a unique id for DataGrid
      ...team,
    }));
    console.log("Formatted teams data:", formattedTeams);
    console.log("in get");

    return NextResponse.json(formattedTeams);
  } catch (error) {
    console.error("Error fetching teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 }
    );
  }
}

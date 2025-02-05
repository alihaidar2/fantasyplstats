import { NextResponse } from "next/server";
import database from "@/lib/cosmosClient";
import { Fixture, Team } from "@/types";

export async function GET() {
  // Check if the database is initialized
  if (!database) {
    return NextResponse.json(
      { error: "Database connection not initialized" },
      { status: 500 }
    );
  }

  try {
    const fixturesContainer = database.container("fixtures");
    const teamsContainer = database.container("teams");
    const gameweeksContainer = database.container("gameweeks");

    // Fetch teams from Cosmos DB
    const teamsQuery = "SELECT * FROM c"; // Query to fetch all teams
    const { resources: teams } = await teamsContainer.items
      .query(teamsQuery)
      .fetchAll();

    // Fetch fixtures from Cosmos DB
    const fixturesQuery = "SELECT * FROM c"; // Query to fetch all fixtures
    const { resources: fixtures } = await fixturesContainer.items
      .query(fixturesQuery)
      .fetchAll();

    // Fetch gameweeks from Cosmos DB
    const gameweeksQuery = "SELECT * FROM c WHERE c.is_next = true";
    const { resources: gameweeks } = await gameweeksContainer.items
      .query(gameweeksQuery)
      .fetchAll();

    // Ensure we have a next gameweek
    const nextGameweek = gameweeks.length > 0 ? gameweeks[0] : null;

    if (!nextGameweek) {
      console.error("No next gameweek found!");
      return NextResponse.json(
        { error: "No next gameweek available" },
        { status: 404 }
      );
    }

    // Convert gameweek ID to int
    const nextGameweekId = parseInt(
      nextGameweek.id.replace("gameweek_", ""),
      10
    );

    // Filter fixtures to only include those from the next gameweek
    const futureFixtures = fixtures.filter(
      (fixture: Fixture) => fixture.event >= nextGameweekId
    );

    // Get unique gameweeks
    const gameweekIds = Array.from(
      new Set(futureFixtures.map((fixture: Fixture) => fixture.event))
    ).sort((a, b) => a - b);

    // Create a map of team_id to short_name for easy lookup
    const teamsMap = teams.reduce(
      (acc: { [key: number]: string }, team: Team) => {
        acc[team.team_id] = team.short_name; // Using `team_id` as the key
        return acc;
      },
      {}
    );

    // Structure the teams with their upcoming fixtures
    const structuredTeams = teams.map((team: Team) => {
      const teamFixtures = futureFixtures
        .filter(
          (fixture: Fixture) =>
            fixture.team_h === team.team_id || fixture.team_a === team.team_id
        )
        .map((fixture: Fixture) => {
          let opponent;
          let difficulty;

          if (fixture.team_h === team.team_id) {
            opponent = teamsMap[fixture.team_a];
            difficulty = fixture.team_h_difficulty;
          } else {
            opponent = teamsMap[fixture.team_h];
            difficulty = fixture.team_a_difficulty;
          }

          return { gameweek: fixture.event, opponent, difficulty };
        });

      return { short_name: team.short_name, fixtures: teamFixtures };
    });

    // Return the structured teams and gameweeks as JSON response
    return NextResponse.json({ structuredTeams, gameweekIds });
  } catch (error) {
    console.error("Error fetching fixtures and teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

// Assuming `dbClient` is set up correctly
const dbClient = require("../../../scripts/astraClient");

export async function GET() {
  try {
    console.log("Fetching fixtures and teams from the database...");

    // Fetch teams
    const teamsCollection = dbClient.collection("teams");
    const teamsCursor = await teamsCollection.find({});
    const teams = await teamsCursor.toArray(); // Convert to array

    // Fetch fixtures
    const fixturesCollection = dbClient.collection("fixtures");
    const fixturesCursor = await fixturesCollection.find({});
    const fixtures = await fixturesCursor.toArray(); // Convert to array

    // Get current date
    const currentDate = new Date();

    // Filter fixtures to only include those where kickoff_time is in the future
    const futureFixtures = fixtures.filter(
      (fixture: { kickoff_time: string | number | Date }) => {
        return new Date(fixture.kickoff_time) > currentDate;
      }
    );

    // Get unique gameweeks from future fixtures
    const gameweeks = [
      ...new Set(
        futureFixtures.map((fixture: { event: any }) => fixture.event)
      ),
    ].sort((a, b) => a - b); // Sort gameweeks

    // Create a map of team_id to short_name for quick lookup
    const teamsMap = teams.reduce(
      (
        acc: { [x: string]: any },
        team: { team_id: string | number; short_name: any }
      ) => {
        acc[team.team_id] = team.short_name;
        return acc;
      },
      {}
    );

    // Create the matrix for the table
    // const tableData = teams.map((team: { short_name: any; team_id: any }) => {
    //   // For each team, create a row with the team name and gameweek difficulties
    //   const row = { short_name: team.short_name };

    //   // Find future fixtures for this team
    //   const teamFixtures = futureFixtures.filter(
    //     (fixture: { team_h: any; team_a: any }) =>
    //       fixture.team_h === team.team_id || fixture.team_a === team.team_id
    //   );

    //   // Add each future gameweek's difficulty for the opposing team
    //   gameweeks.forEach((gw) => {
    //     const fixture = teamFixtures.find(
    //       (f: { event: any }) => f.event === gw
    //     );
    //     if (fixture) {
    //       // If the team is the home team, get the away team's difficulty
    //       if (fixture.team_h === team.team_id) {
    //         const opponent = teamsMap[fixture.team_a];
    //         row[`GW${gw}`] = `${opponent}`;
    //       }
    //       // If the team is the away team, get the home team's difficulty
    //       else if (fixture.team_a === team.team_id) {
    //         const opponent = teamsMap[fixture.team_h];
    //         row[`GW${gw}`] = `${opponent}`;
    //       }
    //     } else {
    //       row[`GW${gw}`] = "-"; // No fixture in this gameweek
    //     }
    //   });

    //   return row;
    // });

    const structuredTeams = teams.map(
      (team: { team_id: any; short_name: any }) => {
        const teamFixtures = futureFixtures
          .filter(
            (fixture: { team_h: any; team_a: any }) =>
              fixture.team_h === team.team_id || fixture.team_a === team.team_id
          )
          .map(
            (fixture: {
              event: any;
              team_h: any;
              team_a: any;
              team_h_difficulty: number;
              team_a_difficulty: number;
            }) => {
              let opponent, difficulty;

              if (fixture.team_h === team.team_id) {
                opponent = teamsMap[fixture.team_a];
                difficulty = fixture.team_h_difficulty;
              } else {
                opponent = teamsMap[fixture.team_h];
                difficulty = fixture.team_a_difficulty;
              }

              return {
                gameweek: fixture.event,
                opponent,
                difficulty,
              };
            }
          );

        return {
          short_name: team.short_name,
          fixtures: teamFixtures,
        };
      }
    );

    // Log the structured table data
    // console.log("Table Data:", tableData);
    // console.log("structuredTeams:", structuredTeams);

    // Return the structured data
    return NextResponse.json({ structuredTeams, gameweeks });
  } catch (error) {
    console.error("Error fetching fixtures and teams:", error);
    return NextResponse.json(
      { error: "Failed to fetch fixtures and teams" },
      { status: 500 }
    );
  }
}

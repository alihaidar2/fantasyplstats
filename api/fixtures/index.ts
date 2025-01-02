/* eslint-disable @typescript-eslint/no-explicit-any */
import { CosmosClient } from "@azure/cosmos";

const httpTrigger = async function (context: any): Promise<void> {
  try {
    const client = new CosmosClient({
      endpoint: process.env.COSMOS_DB_ENDPOINT!,
      key: process.env.COSMOS_DB_KEY!,
    });

    const database = client.database(process.env.COSMOS_DB_DATABASE!);
    const fixturesContainer = database.container("fixtures");
    const teamsContainer = database.container("teams");

    const { resources: teams } = await teamsContainer.items
      .query("SELECT * FROM c")
      .fetchAll();

    const { resources: fixtures } = await fixturesContainer.items
      .query("SELECT * FROM c")
      .fetchAll();

    const currentDate = new Date();

    const futureFixtures = fixtures.filter(
      (fixture) => new Date(fixture.kickoff_time) > currentDate
    );

    const gameweeks = Array.from(
      new Set(futureFixtures.map((fixture) => fixture.event))
    ).sort((a, b) => a - b);

    const teamsMap = teams.reduce((acc, team) => {
      acc[team.team_id] = team.short_name;
      return acc;
    }, {});

    const structuredTeams = teams.map((team) => {
      const teamFixtures = futureFixtures
        .filter(
          (fixture) =>
            fixture.team_h === team.team_id || fixture.team_a === team.team_id
        )
        .map((fixture) => {
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

    context.res = {
      status: 200,
      body: { structuredTeams, gameweeks },
    };
  } catch (error) {
    context.log("Error fetching fixtures and teams:", error);
    context.res = {
      status: 500,
      body: { error: "Failed to fetch data" },
    };
  }
};

export default httpTrigger;

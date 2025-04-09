import { NextResponse } from "next/server";
import database from "@/lib/cosmosClient";
import { Fixture, Team } from "@/types";

export async function GET() {
  try {
    console.log("[API] Starting GET /api/fixtures");

    if (!database) {
      console.error("[API] ❌ Database connection not initialized");
      return NextResponse.json(
        { error: "Database connection not initialized" },
        { status: 500 }
      );
    }

    let fixturesContainer, teamsContainer, gameweeksContainer;

    try {
      fixturesContainer = database.container("fixtures");
      console.log("[API] ✅ fixturesContainer initialized");
    } catch (e) {
      console.error("[API] ❌ Error initializing fixturesContainer:", e);
    }

    try {
      teamsContainer = database.container("teams");
      console.log("[API] ✅ teamsContainer initialized");
    } catch (e) {
      console.error("[API] ❌ Error initializing teamsContainer:", e);
    }

    try {
      gameweeksContainer = database.container("gameweeks");
      console.log("[API] ✅ gameweeksContainer initialized");
    } catch (e) {
      console.error("[API] ❌ Error initializing gameweeksContainer:", e);
    }

    console.log("[API] ✅ Containers initialized");

    let teams, fixtures, gameweeks;

    try {
      console.log("[API] 🔄 Fetching teams...");
      const { resources } = await teamsContainer.items
        .query("SELECT * FROM c")
        .fetchAll();
      teams = resources;
      console.log(`[API] ✅ Retrieved ${teams.length} teams`);
    } catch (err) {
      console.error("[API] ❌ Failed fetching teams:", err);
      throw new Error("Failed fetching teams");
    }

    try {
      console.log("[API] 🔄 Fetching fixtures...");
      const { resources } = await fixturesContainer.items
        .query("SELECT * FROM c")
        .fetchAll();
      fixtures = resources;
      console.log(`[API] ✅ Retrieved ${fixtures.length} fixtures`);
    } catch (err) {
      console.error("[API] ❌ Failed fetching fixtures:", err);
      throw new Error("Failed fetching fixtures");
    }

    try {
      console.log("[API] 🔄 Fetching next gameweek...");
      const { resources } = await gameweeksContainer.items
        .query("SELECT * FROM c WHERE c.is_next = true")
        .fetchAll();
      gameweeks = resources;
      console.log(`[API] ✅ Retrieved ${gameweeks.length} next gameweek(s)`);
    } catch (err) {
      console.error("[API] ❌ Failed fetching gameweeks:", err);
      throw new Error("Failed fetching gameweeks");
    }

    const nextGameweek = gameweeks[0];
    if (!nextGameweek) {
      console.error("[API] ❌ No next gameweek found!");
      return NextResponse.json(
        { error: "No next gameweek available" },
        { status: 404 }
      );
    }

    const nextGameweekId = parseInt(
      nextGameweek.id.replace("gameweek_", ""),
      10
    );
    console.log(`[API] 📆 Next gameweek ID: ${nextGameweekId}`);

    const futureFixtures = fixtures.filter(
      (fixture: Fixture) => fixture.event >= nextGameweekId
    );
    const gameweekIds = Array.from(
      new Set(futureFixtures.map((fixture: Fixture) => fixture.event))
    ).sort((a, b) => (a as number) - (b as number));

    console.log(
      `[API] 📊 ${futureFixtures.length} future fixtures, gameweeks: ${gameweekIds}`
    );

    const teamsMap = teams.reduce(
      (acc: { [key: number]: string }, team: Team) => {
        acc[team.team_id] = team.short_name;
        return acc;
      },
      {}
    );

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

    console.log("[API] ✅ Successfully structured teams");

    return NextResponse.json({ structuredTeams, gameweekIds });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("[API] ❌ Final catch -", error.message);
      return NextResponse.json(
        { error: "Failed to fetch data", message: error.message },
        { status: 500 }
      );
    } else {
      console.error("[API] ❌ Final catch - Unknown error", error);
      return NextResponse.json(
        { error: "Failed to fetch data", message: "Unknown error" },
        { status: 500 }
      );
    }
  }
}

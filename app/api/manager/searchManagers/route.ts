import database from "@/lib/cosmosClient";
// import { CosmosClient } from "@azure/cosmos";
// import dotenv from "dotenv";

// Load environment variables from .env.local file
// dotenv.config({ path: "./.env.local" }); // Explicitly specify the path to the .env file

// ✅ API Handler for Searching by Team Name (App Router)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");

    if (!query || query.length < 2) {
      return new Response(
        JSON.stringify({ error: "Please enter at least 2 characters." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const managerContainer = database!.container("managers");

    // ✅ Query CosmosDB for `team_name` matches (case-insensitive)
    const { resources } = await managerContainer.items
      .query({
        query:
          "SELECT c.entry_id, c.team_name FROM c WHERE CONTAINS(LOWER(c.team_name), @query)",
        parameters: [{ name: "@query", value: query.toLowerCase() }],
      })
      .fetchAll();

    return new Response(JSON.stringify(resources), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("🚨 Error searching managers:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

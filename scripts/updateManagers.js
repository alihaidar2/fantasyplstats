import dotenv from "dotenv";
import axios from "axios";
import { CosmosClient } from "@azure/cosmos";

// Load environment variables from .env.local file
dotenv.config({ path: './.env.local' }); // Explicitly specify the path to the .env file

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const db_name = process.env.COSMOS_DB_DATABASE;
const client = new CosmosClient({ endpoint, key });
const database = client.database(db_name); // Your Cosmos DB database name
const managersContainer = database.container("managers"); // Managers container

const MANAGER_ID = "3764508"; // Your FPL Manager ID

// ✅ Function to fetch leagues for your manager
async function getLeagueIds() {
  try {
    const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${MANAGER_ID}/`);
    if (response.status === 200) {
      return response.data.leagues.classic.map((league) => league.id);
    }
  } catch (error) {
    console.error("🚨 Error fetching manager leagues:", error.message);
  }
  return [];
}

// ✅ Function to fetch all managers in your leagues
async function getLeagueManagers(leagueIds) {
  let managerIds = [];
  for (const leagueId of leagueIds) {
    try {
      const response = await axios.get(`https://fantasy.premierleague.com/api/leagues-classic/${leagueId}/standings/`);
      if (response.status === 200) {
        const leagueManagers = response.data.standings.results.map((manager) => manager.entry);
        managerIds = [...managerIds, ...leagueManagers];
      }
    } catch (error) {
      console.error(`🚨 Error fetching league ${leagueId}:`, error.message);
    }
  }
  return [...new Set(managerIds)]; // Remove duplicates
}

// ✅ Function to update managers in your leagues
async function updateLeagueManagers() {
  const leagueIds = await getLeagueIds();
  console.log(`📡 Found ${leagueIds.length} leagues:`, leagueIds);

  const managerIds = await getLeagueManagers(leagueIds);
  console.log(`📡 Found ${managerIds.length} managers in your leagues`);

  for (const id of managerIds) {
    try {
      const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${id}/`);
      if (response.status === 200) {
        const manager = response.data;

        // ✅ Store manager data (NO PLAYER DATA)
        const managerData = {
          id: `manager_${manager.id}`,
          entry_id: manager.id,
          team_name: manager.name,
          first_name: manager.player_first_name,
          last_name: manager.player_last_name,
          region: manager.player_region_name,
          overall_points: manager.summary_overall_points,
          overall_rank: manager.summary_overall_rank,
          gw_points: manager.summary_event_points,
          gw_rank: manager.summary_event_rank,
          favourite_team: manager.favourite_team,
          last_deadline_value: manager.last_deadline_value / 10,
          last_deadline_bank: manager.last_deadline_bank / 10,
          leagues: manager.leagues.classic.map((league) => ({
            league_id: league.id,
            league_name: league.name,
            rank: league.entry_rank,
            total_teams: league.rank_count,
          })),
          updated_at: new Date().toISOString(),
        };

        await managersContainer.items.upsert(managerData);
        console.log(`✅ Updated manager ${manager.id}: ${manager.name}`);
      }
    } catch (error) {
      console.error(`🚨 Error fetching manager ${id}:`, error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay to avoid rate limits
  }

  console.log("🎯 Finished updating league managers!");
}

// ✅ Run the function manually
updateLeagueManagers().then(() => {
  console.log("✅ Done! Check Azure CosmosDB (FPLData > managers) for updates.");
  process.exit();
});

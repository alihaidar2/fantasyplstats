import dotenv from "dotenv";
import axios from "axios";
import { CosmosClient } from "@azure/cosmos";

// Load environment variables from .env.local file
dotenv.config({ path: '../.env.local' }); // Explicitly specify the path to the .env file
const endpoint = process.env.COSMOS_DB_ENDPOINT;
console.log("endpoint: ", endpoint)

const key = process.env.COSMOS_DB_KEY;
console.log("key: ", key)

const db_name = process.env.COSMOS_DB_DATABASE;
console.log("db_name: ", db_name)

const client = new CosmosClient({ endpoint, key });
console.log("client: ", client)

const database = client.database(db_name); // Your Cosmos DB database name
console.log("database: ", database)

const seasonId = 2425; // Current Season ID

// Function to insert/update data into Cosmos DB container
async function upsertData(containerName, data) {
  const container = database.container(containerName);

  for (const item of data) {
    try {
      await container.items.upsert(item); // Upsert to insert or update data
      console.log(`Successfully upserted item with ID: ${item.id}`);
    } catch (error) {
      console.error("Error upserting item:", error);
    }
  }
}

// Delete existing data
async function deleteAllData() {
  console.log("Deleting existing data...");

  try {
    const containers = ["seasons", "fixtures", "players", "teams", "gameweeks"];
    for (const containerName of containers) {
      const container = database.container(containerName);
      const { resources: items } = await container.items
        .query("SELECT * FROM c")
        .fetchAll();
      for (const item of items) {
        await container.item(item.id, item.partitionKey).delete();
      }
    }
    console.log("Deleted data");
  } catch (error) {
    console.error("Error deleting data:", error);
  }
}

// Update Seasons
async function updateSeasons() {
  try {
    await upsertData("seasons", [
      {
        id: `season_${seasonId}`,
        season_id: seasonId,
        start_year: 2024,
        end_year: 2025,
      },
    ]);
    console.log("Seasons data upserted successfully.");
  } catch (error) {
    console.error("Error adding seasons:", error);
  }
}

// Insert and update Players
async function updatePlayers() {
  try {
    const url = "https://fantasy.premierleague.com/api/bootstrap-static";
    const response = await axios.get(url);
    const players = response.data.elements;

    const playersData = players.map((player) => ({
      id: `player_${player.id}`,
      season_id: seasonId,
      player_id: player.id,
      chance_of_playing_next_round: player.chance_of_playing_next_round,
      chance_of_playing_this_round: player.chance_of_playing_this_round,
      code: player.code,
      cost_change_event: player.cost_change_event,
      cost_change_event_fall: player.cost_change_event_fall,
      cost_change_start: player.cost_change_start,
      cost_change_start_fall: player.cost_change_start_fall,
      dreamteam_count: player.dreamteam_count,
      element_type: player.element_type,
      ep_next: parseFloat(player.ep_next),
      ep_this: parseFloat(player.ep_this),
      event_points: player.event_points,
      first_name: player.first_name,
      form: parseFloat(player.form),
      in_dreamteam: player.in_dreamteam,
      news: player.news,
      news_added: player.news_added
        ? new Date(player.news_added).toISOString()
        : null,
      now_cost: player.now_cost,
      photo: player.photo,
      points_per_game: parseFloat(player.points_per_game),
      second_name: player.second_name,
      selected_by_percent: parseFloat(player.selected_by_percent),
      special: player.special,
      squad_number: player.squad_number,
      status: player.status,
      team_id: player.team,
      team_code: player.team_code,
      total_points: player.total_points,
      transfers_in: player.transfers_in,
      transfers_in_event: player.transfers_in_event,
      transfers_out: player.transfers_out,
      transfers_out_event: player.transfers_out_event,
      value_form: parseFloat(player.value_form),
      value_season: parseFloat(player.value_season),
      web_name: player.web_name,
      minutes: player.minutes,
      goals_scored: player.goals_scored,
      assists: player.assists,
      clean_sheets: player.clean_sheets,
      goals_conceded: player.goals_conceded,
      own_goals: player.own_goals,
      penalties_saved: player.penalties_saved,
      penalties_missed: player.penalties_missed,
      yellow_cards: player.yellow_cards,
      red_cards: player.red_cards,
      saves: player.saves,
      bonus: player.bonus,
      bps: player.bps,
      influence: parseFloat(player.influence),
      creativity: parseFloat(player.creativity),
      threat: parseFloat(player.threat),
      ict_index: parseFloat(player.ict_index),
      starts: player.starts,
      expected_goals: parseFloat(player.expected_goals),
      expected_assists: parseFloat(player.expected_assists),
      expected_goal_involvements: parseFloat(player.expected_goal_involvements),
      expected_goals_conceded: parseFloat(player.expected_goals_conceded),
      influence_rank: player.influence_rank,
      influence_rank_type: player.influence_rank_type,
      creativity_rank: player.creativity_rank,
      creativity_rank_type: player.creativity_rank_type,
      threat_rank: player.threat_rank,
      threat_rank_type: player.threat_rank_type,
      ict_index_rank: player.ict_index_rank,
      ict_index_rank_type: player.ict_index_rank_type,
      corners_and_indirect_freekicks_order:
        player.corners_and_indirect_freekicks_order,
      corners_and_indirect_freekicks_text:
        player.corners_and_indirect_freekicks_text,
      direct_freekicks_order: player.direct_freekicks_order,
      direct_freekicks_text: player.direct_freekicks_text,
      penalties_order: player.penalties_order,
      penalties_text: player.penalties_text,
      expected_goals_per_90: parseFloat(player.expected_goals_per_90),
      saves_per_90: parseFloat(player.saves_per_90),
      expected_assists_per_90: parseFloat(player.expected_assists_per_90),
      expected_goal_involvements_per_90: parseFloat(
        player.expected_goal_involvements_per_90
      ),
      expected_goals_conceded_per_90: parseFloat(
        player.expected_goals_conceded_per_90
      ),
      goals_conceded_per_90: parseFloat(player.goals_conceded_per_90),
      now_cost_rank: player.now_cost_rank,
      now_cost_rank_type: player.now_cost_rank_type,
      form_rank: player.form_rank,
      form_rank_type: player.form_rank_type,
      points_per_game_rank: player.points_per_game_rank,
      points_per_game_rank_type: player.points_per_game_rank_type,
      selected_rank: player.selected_rank,
      selected_rank_type: player.selected_rank_type,
      starts_per_90: parseFloat(player.starts_per_90),
      clean_sheets_per_90: parseFloat(player.clean_sheets_per_90),
    }));

    await upsertData("players", playersData);
    console.log("Players data upserted successfully.");
  } catch (error) {
    console.error("Error updating players:", error);
  }
}

// Insert and update Fixtures
async function updateFixtures() {
  try {
    const url = "https://fantasy.premierleague.com/api/fixtures";
    const response = await axios.get(url);
    const fixtures = response.data;

    const fixturesData = fixtures.map((fixture) => ({
      id: `fixture_${fixture.id}`,
      season_id: seasonId,
      fixture_id: fixture.id,
      event: fixture.event,
      finished: fixture.finished,
      kickoff_time: new Date(fixture.kickoff_time).toISOString(),
      minutes: fixture.minutes,
      started: fixture.started,
      team_a: fixture.team_a,
      team_a_score: fixture.team_a_score,
      team_h: fixture.team_h,
      team_h_score: fixture.team_h_score,
      team_h_difficulty: fixture.team_h_difficulty,
      team_a_difficulty: fixture.team_a_difficulty,
      pulse_id: fixture.pulse_id,
    }));

    await upsertData("fixtures", fixturesData);
    console.log("Fixtures data upserted successfully.");
  } catch (error) {
    console.error("Error updating fixtures:", error);
  }
}

// Insert and update Teams
async function updateTeams() {
  try {
    const url = "https://fantasy.premierleague.com/api/bootstrap-static/";
    const response = await axios.get(url);
    const teams = response.data.teams;

    const teamsData = teams.map((team) => ({
      id: `team_${team.id}`,
      season_id: seasonId,
      team_id: team.id,
      team_name: team.name,
      short_name: team.short_name,
      points: team.points,
      strength: team.strength,
      strength_overall_home: team.strength_overall_home,
      strength_overall_away: team.strength_overall_away,
      strength_attack_home: team.strength_attack_home,
      strength_attack_away: team.strength_attack_away,
      strength_defence_home: team.strength_defence_home,
      strength_defence_away: team.strength_defence_away,
      draw: team.draw,
      loss: team.loss,
      win: team.win,
      team_division: team.team_division,
      unavailable: team.unavailable,
      pulse_id: team.pulse_id,
    }));
    console.log("teamsData: ", teamsData);

    await upsertData("teams", teamsData);

    console.log("Teams data upserted successfully.");
  } catch (error) {
    console.error("Error updating teams:", error);
  }
}

// Insert and update Gameweeks
async function updateGameweeks() {
  try {
    const url = "https://fantasy.premierleague.com/api/bootstrap-static";
    const response = await axios.get(url);
    const gameweeks = response.data.events;

    const gameweeksData = gameweeks.map((gameweek) => ({
      id: `gameweek_${gameweek.id}`,
      name: gameweek.name,
      deadline_time: new Date(gameweek.deadline_time).toISOString(),
      average_entry_score: gameweek.average_entry_score,
      finished: gameweek.finished,
      data_checked: gameweek.data_checked,
      highest_scoring_entry: gameweek.highest_scoring_entry,
      deadline_time_epoch: gameweek.deadline_time_epoch,
      deadline_time_game_offset: gameweek.deadline_time_game_offset,
      highest_score: gameweek.highest_score,
      is_previous: gameweek.is_previous,
      is_current: gameweek.is_current,
      is_next: gameweek.is_next,
      cup_leagues_created: gameweek.cup_leagues_created,
      h2h_ko_matches_created: gameweek.h2h_ko_matches_created,
      most_selected: gameweek.most_selected,
      most_transferred_in: gameweek.most_transferred_in,
      top_element: gameweek.top_element,
      transfers_made: gameweek.transfers_made,
      most_captained: gameweek.most_captained,
      most_vice_captained: gameweek.most_vice_captained,
    }));

    await upsertData("gameweeks", gameweeksData);
    console.log("Gameweeks data upserted successfully.");
  } catch (error) {
    console.error("Error updating gameweeks:", error);
  }
}

// Initialize the database with data
async function initializeDatabase() {
  try {
    await deleteAllData(); // Clean the database
    await updateSeasons();
    await updateTeams();
    await updateFixtures();
    await updatePlayers();
    await updateGameweeks();
    console.log("Database initialized and updated successfully.");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Run the initialize function
initializeDatabase().catch(console.error);

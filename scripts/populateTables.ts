const db = require("./astraClient");
const { v4: uuidv4 } = require("uuid");

const seasonId = 2425; // Assuming a constant season_id

// Delete existing data
async function deleteAllData() {
  console.log("Deleting existing data...");
  try {
    await db.collection("seasons").deleteMany({});
    await db.collection("fixtures").deleteMany({});
    await db.collection("players").deleteMany({});
    await db.collection("teams").deleteMany({});
    await db.collection("gameweeks").deleteMany({});
    console.log("Deleted data");
  } catch (error) {
    console.error("Error deleting data:", error);
  }
}

// Insert the Season
async function updateSeasons() {
  try {
    await db.collection("seasons").insertOne({
      season_id: seasonId,
      start_year: 2024,
      end_year: 2025,
    });
    console.log("Added seasons");
  } catch (error) {
    console.error("Error adding seasons:", error);
  }
}

async function updatePlayers() {
  try {
    const url = "https://fantasy.premierleague.com/api/bootstrap-static";
    const response = await fetch(url);
    const data = await response.json();
    const players = data.elements;

    for (const player of players) {
      await insertPlayer(player);
    }
    console.log("All players have been inserted successfully.");
  } catch (error) {
    console.error("Error updating players:", error);
  }
}

async function insertPlayer(player: any) {
  try {
    await db.collection("players").insertOne({
      player_id: player.id,
      season_id: seasonId,
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
    });
  } catch (error) {
    console.error("Error inserting player:", error);
  }
}

async function updateFixtures() {
  try {
    const url = "https://fantasy.premierleague.com/api/fixtures";
    const response = await fetch(url);
    const fixtures = await response.json();

    for (const fixture of fixtures) {
      if (fixture.event != null) {
        await insertFixture(fixture);
      }
    }
    console.log("All fixtures have been inserted successfully.");
  } catch (error) {
    console.error("Error updating fixtures:", error);
  }
}

async function insertFixture(fixture: any) {
  try {
    await db.collection("fixtures").insertOne({
      fixture_id: fixture.id,
      season_id: seasonId,
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
    });
  } catch (error) {
    console.error("Error inserting fixture:", error);
  }
}

async function updateTeams() {
  try {
    const url = "https://fantasy.premierleague.com/api/bootstrap-static/";
    const response = await fetch(url);
    const data = await response.json();
    const teams = data.teams;

    for (const team of teams) {
      await insertTeam(team);
    }
    console.log("All teams have been inserted successfully.");
  } catch (error) {
    console.error("Error updating teams:", error);
  }
}

async function insertTeam(team: any) {
  try {
    await db.collection("teams").insertOne({
      season_id: seasonId,
      team_id: team.id,
      code: team.code,
      draw: team.draw,
      form: team.form,
      loss: team.loss,
      team_name: team.name,
      played: team.played,
      points: team.points,
      position: team.position,
      short_name: team.short_name,
      strength: team.strength,
      team_division: team.team_division,
      unavailable: team.unavailable,
      win: team.win,
      strength_overall_home: team.strength_overall_home,
      strength_overall_away: team.strength_overall_away,
      strength_attack_home: team.strength_attack_home,
      strength_attack_away: team.strength_attack_away,
      strength_defence_home: team.strength_defence_home,
      strength_defence_away: team.strength_defence_away,
      pulse_id: team.pulse_id,
    });
  } catch (error) {
    console.error("Error inserting team:", error);
  }
}

async function updateGameweeks() {
  try {
    const url = "https://fantasy.premierleague.com/api/bootstrap-static";
    const response = await fetch(url);
    const data = await response.json();
    const gameweeks = data.events;

    for (const gameweek of gameweeks) {
      await insertGameweek(gameweek);
    }
    console.log("All gameweeks have been inserted successfully.");
  } catch (error) {
    console.error("Error updating gameweeks:", error);
  }
}

async function insertGameweek(gameweek: any) {
  try {
    await db.collection("gameweeks").insertOne({
      id: gameweek.id,
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
    });
  } catch (error) {
    console.error("Error inserting gameweek:", error);
  }
}

async function initializeDatabase() {
  try {
    await deleteAllData();
    updateSeasons();
    updateTeams();
    updateFixtures();
    updatePlayers();
    updateGameweeks();
    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

initializeDatabase().catch(console.error);
